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

    async def download_from_civitai(self, download_url: str, save_dir: str, relative_path: str = '') -> Dict:
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

            # 2. 获取文件信息
            file_info = next((f for f in version_info.get('files', []) if f.get('primary')), None)
            if not file_info:
                return {'success': False, 'error': 'No primary file found in metadata'}

            # 3. 准备下载
            file_name = file_info['name']
            save_path = os.path.join(save_dir, file_name)
            file_size = file_info.get('sizeKB', 0) * 1024

            # 4. 通知文件监控系统
            self.file_monitor.handler.add_ignore_path(
                save_path.replace(os.sep, '/'),
                file_size
            )

            # 5. 准备元数据
            metadata = LoraMetadata.from_civitai_info(version_info, file_info, save_path)
            
            # 6. 开始下载流程
            result = await self._execute_download(
                download_url=download_url,
                save_dir=save_dir,
                metadata=metadata,
                version_info=version_info,
                relative_path=relative_path
            )

            return result

        except Exception as e:
            logger.error(f"Error in download_from_civitai: {e}", exc_info=True)
            return {'success': False, 'error': str(e)}

    async def _execute_download(self, download_url: str, save_dir: str, 
                              metadata: LoraMetadata, version_info: Dict, relative_path: str) -> Dict:
        """执行实际的下载流程，包括预览图和模型文件"""
        try:
            save_path = metadata.file_path
            metadata_path = os.path.splitext(save_path)[0] + '.metadata.json'

            # 2. 下载预览图（如果有）
            images = version_info.get('images', [])
            if images:
                preview_ext = '.mp4' if images[0].get('type') == 'video' else '.png'
                preview_path = os.path.splitext(save_path)[0] + '.preview' + preview_ext
                if await self.civitai_client.download_preview_image(images[0]['url'], preview_path):
                    metadata.preview_url = preview_path.replace(os.sep, '/')
                    # 更新元数据中的预览图URL
                    with open(metadata_path, 'w', encoding='utf-8') as f:
                        json.dump(metadata.to_dict(), f, indent=2, ensure_ascii=False)

            # 3. 下载模型文件
            success, result = await self.civitai_client._download_file(
                download_url, 
                save_dir,
                os.path.basename(save_path)
            )

            if not success:
                # 下载失败时清理文件
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
            cache.folders = sorted(list(all_folders))

            return {
                'success': True
            }

        except Exception as e:
            logger.error(f"Error in _execute_download: {e}", exc_info=True)
            # 确保清理任何部分下载的文件
            for path in [save_path, metadata_path]:
                if path and os.path.exists(path):
                    os.remove(path)
            return {'success': False, 'error': str(e)}