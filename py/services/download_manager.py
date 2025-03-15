import logging
import os
import json
from typing import Optional, Dict
from .civitai_client import CivitaiClient
from .file_monitor import LoraFileMonitor
from ..utils.models import LoraMetadata

logger = logging.getLogger(__name__)

class DownloadManager:
    def __init__(self, file_monitor: Optional[LoraFileMonitor] = None):
        self.civitai_client = CivitaiClient()
        self.file_monitor = file_monitor

    async def download_from_civitai(self, download_url: str, save_dir: str, relative_path: str = '', 
                                  progress_callback=None) -> Dict:
        try:
            # Update save directory with relative path if provided
            if relative_path:
                save_dir = os.path.join(save_dir, relative_path)
                # Create directory if it doesn't exist
                os.makedirs(save_dir, exist_ok=True)

            # Get version info
            version_id = download_url.split('/')[-1]
            version_info = await self.civitai_client.get_model_version_info(version_id)
            if not version_info:
                return {'success': False, 'error': 'Failed to fetch model metadata'}

            # Report initial progress
            if progress_callback:
                await progress_callback(0)

            # 2. 获取文件信息
            file_info = next((f for f in version_info.get('files', []) if f.get('primary')), None)
            if not file_info:
                return {'success': False, 'error': 'No primary file found in metadata'}

            # 3. 准备下载
            file_name = file_info['name']
            save_path = os.path.join(save_dir, file_name)
            file_size = file_info.get('sizeKB', 0) * 1024

            # 4. 通知文件监控系统 - 使用规范化路径和文件大小
            if self.file_monitor and self.file_monitor.handler:
                # Add both the normalized path and potential alternative paths
                normalized_path = save_path.replace(os.sep, '/')
                self.file_monitor.handler.add_ignore_path(normalized_path, file_size)
                
                # Also add the path with file extension variations (.safetensors)
                if not normalized_path.endswith('.safetensors'):
                    safetensors_path = os.path.splitext(normalized_path)[0] + '.safetensors'
                    self.file_monitor.handler.add_ignore_path(safetensors_path, file_size)
                
                logger.debug(f"Added download path to ignore list: {normalized_path} (size: {file_size} bytes)")

            # 5. 准备元数据
            metadata = LoraMetadata.from_civitai_info(version_info, file_info, save_path)
            
            # 5.1 获取并更新模型标签和描述信息
            model_id = version_info.get('modelId')
            if model_id:
                model_metadata, _ = await self.civitai_client.get_model_metadata(str(model_id))
                if model_metadata:
                    if model_metadata.get("tags"):
                        metadata.tags = model_metadata.get("tags", [])
                    if model_metadata.get("description"):
                        metadata.modelDescription = model_metadata.get("description", "")
            
            # 6. 开始下载流程
            result = await self._execute_download(
                download_url=download_url,
                save_dir=save_dir,
                metadata=metadata,
                version_info=version_info,
                relative_path=relative_path,
                progress_callback=progress_callback
            )

            return result

        except Exception as e:
            logger.error(f"Error in download_from_civitai: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}

    async def _execute_download(self, download_url: str, save_dir: str, 
                              metadata: LoraMetadata, version_info: Dict, 
                              relative_path: str, progress_callback=None) -> Dict:
        """Execute the actual download process including preview images and model files"""
        try:
            save_path = metadata.file_path
            metadata_path = os.path.splitext(save_path)[0] + '.metadata.json'

            # Download preview image if available
            images = version_info.get('images', [])
            if images:
                # Report preview download progress
                if progress_callback:
                    await progress_callback(1)  # 1% progress for starting preview download

                preview_ext = '.mp4' if images[0].get('type') == 'video' else '.png'
                preview_path = os.path.splitext(save_path)[0] + '.preview' + preview_ext
                if await self.civitai_client.download_preview_image(images[0]['url'], preview_path):
                    metadata.preview_url = preview_path.replace(os.sep, '/')
                    metadata.preview_nsfw_level = images[0].get('nsfwLevel', 0)
                    with open(metadata_path, 'w', encoding='utf-8') as f:
                        json.dump(metadata.to_dict(), f, indent=2, ensure_ascii=False)

                # Report preview download completion
                if progress_callback:
                    await progress_callback(3)  # 3% progress after preview download

            # Download model file with progress tracking
            success, result = await self.civitai_client._download_file(
                download_url, 
                save_dir,
                os.path.basename(save_path),
                progress_callback=lambda p: self._handle_download_progress(p, progress_callback)
            )

            if not success:
                # Clean up files on failure
                for path in [save_path, metadata_path, metadata.preview_url]:
                    if path and os.path.exists(path):
                        os.remove(path)
                return {'success': False, 'error': result}

            # 4. 更新文件信息（大小和修改时间）
            metadata.update_file_info(save_path)

            # 5. 最终更新元数据
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata.to_dict(), f, indent=2, ensure_ascii=False)

            # 6. update lora cache
            cache = await self.file_monitor.scanner.get_cached_data()
            metadata_dict = metadata.to_dict()
            metadata_dict['folder'] = relative_path
            cache.raw_data.append(metadata_dict)
            await cache.resort()
            all_folders = set(cache.folders)
            all_folders.add(relative_path)
            cache.folders = sorted(list(all_folders), key=lambda x: x.lower())
            
            # Update the hash index with the new LoRA entry
            self.file_monitor.scanner._hash_index.add_entry(metadata_dict['sha256'], metadata_dict['file_path'])

            # Report 100% completion
            if progress_callback:
                await progress_callback(100)

            return {
                'success': True
            }

        except Exception as e:
            logger.error(f"Error in _execute_download: {e}", exc_info=True)
            # Clean up partial downloads
            for path in [save_path, metadata_path]:
                if path and os.path.exists(path):
                    os.remove(path)
            return {'success': False, 'error': str(e)}

    async def _handle_download_progress(self, file_progress: float, progress_callback):
        """Convert file download progress to overall progress
        
        Args:
            file_progress: Progress of file download (0-100)
            progress_callback: Callback function for progress updates
        """
        if progress_callback:
            # Scale file progress to 3-100 range (after preview download)
            overall_progress = 3 + (file_progress * 0.97)  # 97% of progress for file download
            await progress_callback(round(overall_progress))