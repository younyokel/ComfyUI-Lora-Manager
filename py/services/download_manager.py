import logging
import os
import json
import asyncio
from typing import Optional, Dict, Any
from .civitai_client import CivitaiClient
from ..utils.models import LoraMetadata, CheckpointMetadata
from ..utils.constants import CARD_PREVIEW_WIDTH
from ..utils.exif_utils import ExifUtils
from .service_registry import ServiceRegistry

# Download to temporary file first
import tempfile

logger = logging.getLogger(__name__)

class DownloadManager:
    _instance = None
    _lock = asyncio.Lock()
    
    @classmethod
    async def get_instance(cls):
        """Get singleton instance of DownloadManager"""
        async with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def __init__(self):
        # Check if already initialized for singleton pattern
        if hasattr(self, '_initialized'):
            return
        self._initialized = True
        
        self._civitai_client = None  # Will be lazily initialized

    async def _get_civitai_client(self):
        """Lazily initialize CivitaiClient from registry"""
        if self._civitai_client is None:
            self._civitai_client = await ServiceRegistry.get_civitai_client()
        return self._civitai_client

    async def _get_lora_monitor(self):
        """Get the lora file monitor from registry"""
        return await ServiceRegistry.get_lora_monitor()
        
    async def _get_checkpoint_monitor(self):
        """Get the checkpoint file monitor from registry"""
        return await ServiceRegistry.get_checkpoint_monitor()
    
    async def _get_lora_scanner(self):
        """Get the lora scanner from registry"""
        return await ServiceRegistry.get_lora_scanner()
        
    async def _get_checkpoint_scanner(self):
        """Get the checkpoint scanner from registry"""
        return await ServiceRegistry.get_checkpoint_scanner()

    async def download_from_civitai(self, download_url: str = None, model_hash: str = None, 
                                  model_version_id: str = None, save_dir: str = None, 
                                  relative_path: str = '', progress_callback=None, 
                                  model_type: str = "lora") -> Dict:
        """Download model from Civitai
        
        Args:
            download_url: Direct download URL for the model
            model_hash: SHA256 hash of the model
            model_version_id: Civitai model version ID
            save_dir: Directory to save the model to
            relative_path: Relative path within save_dir
            progress_callback: Callback function for progress updates
            model_type: Type of model ('lora' or 'checkpoint')
            
        Returns:
            Dict with download result
        """
        try:
            # Update save directory with relative path if provided
            if relative_path:
                save_dir = os.path.join(save_dir, relative_path)
                # Create directory if it doesn't exist
                os.makedirs(save_dir, exist_ok=True)

            # Get civitai client
            civitai_client = await self._get_civitai_client()

            # Get version info based on the provided identifier
            version_info = None
            error_msg = None
            
            if download_url:
                # Extract version ID from download URL
                version_id = download_url.split('/')[-1]
                version_info, error_msg = await civitai_client.get_model_version_info(version_id)
            elif model_version_id:
                # Use model version ID directly
                version_info, error_msg = await civitai_client.get_model_version_info(model_version_id)
            elif model_hash:
                # Get model by hash
                version_info = await civitai_client.get_model_by_hash(model_hash)

            
            if not version_info:
                if error_msg and "model not found" in error_msg.lower():
                    return {'success': False, 'error': f'Model not found on Civitai: {error_msg}'}
                return {'success': False, 'error': error_msg or 'Failed to fetch model metadata'}

            # Check if this is an early access model
            if version_info.get('earlyAccessEndsAt'):
                early_access_date = version_info.get('earlyAccessEndsAt', '')
                # Convert to a readable date if possible
                try:
                    from datetime import datetime
                    date_obj = datetime.fromisoformat(early_access_date.replace('Z', '+00:00'))
                    formatted_date = date_obj.strftime('%Y-%m-%d')
                    early_access_msg = f"This model requires early access payment (until {formatted_date}). "
                except:
                    early_access_msg = "This model requires early access payment. "
                
                early_access_msg += "Please ensure you have purchased early access and are logged in to Civitai."
                logger.warning(f"Early access model detected: {version_info.get('name', 'Unknown')}")
                
                # We'll still try to download, but log a warning and prepare for potential failure
                if progress_callback:
                    await progress_callback(1)  # Show minimal progress to indicate we're trying

            # Report initial progress
            if progress_callback:
                await progress_callback(0)

            # 2. Get file information
            file_info = next((f for f in version_info.get('files', []) if f.get('primary')), None)
            if not file_info:
                return {'success': False, 'error': 'No primary file found in metadata'}

            # 3. Prepare download
            file_name = file_info['name']
            save_path = os.path.join(save_dir, file_name)
            file_size = file_info.get('sizeKB', 0) * 1024

            # 4. Notify file monitor - use normalized path and file size
            file_monitor = await self._get_lora_monitor() if model_type == "lora" else await self._get_checkpoint_monitor()
            if file_monitor and file_monitor.handler:
                file_monitor.handler.add_ignore_path(
                    save_path.replace(os.sep, '/'),
                    file_size
                )

            # 5. Prepare metadata based on model type
            if model_type == "checkpoint":
                metadata = CheckpointMetadata.from_civitai_info(version_info, file_info, save_path)
                logger.info(f"Creating CheckpointMetadata for {file_name}")
            else:
                metadata = LoraMetadata.from_civitai_info(version_info, file_info, save_path)
                logger.info(f"Creating LoraMetadata for {file_name}")
            
            # 5.1 Get and update model tags and description
            model_id = version_info.get('modelId')
            if model_id:
                model_metadata, _ = await civitai_client.get_model_metadata(str(model_id))
                if model_metadata:
                    if model_metadata.get("tags"):
                        metadata.tags = model_metadata.get("tags", [])
                    if model_metadata.get("description"):
                        metadata.modelDescription = model_metadata.get("description", "")
            
            # 6. Start download process
            result = await self._execute_download(
                download_url=file_info.get('downloadUrl', ''),
                save_dir=save_dir,
                metadata=metadata,
                version_info=version_info,
                relative_path=relative_path,
                progress_callback=progress_callback,
                model_type=model_type
            )

            return result

        except Exception as e:
            logger.error(f"Error in download_from_civitai: {e}", exc_info=True)
            # Check if this might be an early access error
            error_str = str(e).lower()
            if "403" in error_str or "401" in error_str or "unauthorized" in error_str or "early access" in error_str:
                return {'success': False, 'error': f"Early access restriction: {str(e)}. Please ensure you have purchased early access and are logged in to Civitai."}
            return {'success': False, 'error': str(e)}

    async def _execute_download(self, download_url: str, save_dir: str, 
                              metadata, version_info: Dict, 
                              relative_path: str, progress_callback=None,
                              model_type: str = "lora") -> Dict:
        """Execute the actual download process including preview images and model files"""
        try:
            civitai_client = await self._get_civitai_client()
            save_path = metadata.file_path
            metadata_path = os.path.splitext(save_path)[0] + '.metadata.json'

            # Download preview image if available
            images = version_info.get('images', [])
            if images:
                # Report preview download progress
                if progress_callback:
                    await progress_callback(1)  # 1% progress for starting preview download

                # Check if it's a video or an image
                is_video = images[0].get('type') == 'video'
                
                if (is_video):
                    # For videos, use .mp4 extension
                    preview_ext = '.mp4'
                    preview_path = os.path.splitext(save_path)[0] + preview_ext
                    
                    # Download video directly
                    if await civitai_client.download_preview_image(images[0]['url'], preview_path):
                        metadata.preview_url = preview_path.replace(os.sep, '/')
                        metadata.preview_nsfw_level = images[0].get('nsfwLevel', 0)
                        with open(metadata_path, 'w', encoding='utf-8') as f:
                            json.dump(metadata.to_dict(), f, indent=2, ensure_ascii=False)
                else:
                    # For images, use WebP format for better performance
                    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as temp_file:
                        temp_path = temp_file.name
                    
                    # Download the original image to temp path
                    if await civitai_client.download_preview_image(images[0]['url'], temp_path):
                        # Optimize and convert to WebP
                        preview_path = os.path.splitext(save_path)[0] + '.webp'
                        
                        # Use ExifUtils to optimize and convert the image
                        optimized_data, _ = ExifUtils.optimize_image(
                            image_data=temp_path,
                            target_width=CARD_PREVIEW_WIDTH,
                            format='webp',
                            quality=85,
                            preserve_metadata=False
                        )
                        
                        # Save the optimized image
                        with open(preview_path, 'wb') as f:
                            f.write(optimized_data)
                            
                        # Update metadata
                        metadata.preview_url = preview_path.replace(os.sep, '/')
                        metadata.preview_nsfw_level = images[0].get('nsfwLevel', 0)
                        with open(metadata_path, 'w', encoding='utf-8') as f:
                            json.dump(metadata.to_dict(), f, indent=2, ensure_ascii=False)
                        
                        # Remove temporary file
                        try:
                            os.unlink(temp_path)
                        except Exception as e:
                            logger.warning(f"Failed to delete temp file: {e}")

                # Report preview download completion
                if progress_callback:
                    await progress_callback(3)  # 3% progress after preview download

            # Download model file with progress tracking
            success, result = await civitai_client._download_file(
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

            # 4. Update file information (size and modified time)
            metadata.update_file_info(save_path)

            # 5. Final metadata update
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata.to_dict(), f, indent=2, ensure_ascii=False)

            # 6. Update cache based on model type
            if model_type == "checkpoint":
                scanner = await self._get_checkpoint_scanner()
                logger.info(f"Updating checkpoint cache for {save_path}")
            else:
                scanner = await self._get_lora_scanner()
                logger.info(f"Updating lora cache for {save_path}")
                
            cache = await scanner.get_cached_data()
            metadata_dict = metadata.to_dict()
            metadata_dict['folder'] = relative_path
            cache.raw_data.append(metadata_dict)
            await cache.resort()
            all_folders = set(cache.folders)
            all_folders.add(relative_path)
            cache.folders = sorted(list(all_folders), key=lambda x: x.lower())
            
            # Update the hash index with the new model entry
            scanner._hash_index.add_entry(metadata_dict['sha256'], metadata_dict['file_path'])

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