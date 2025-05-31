import os
import json
import logging
from typing import Dict, List, Callable, Awaitable
from aiohttp import web

from .model_utils import determine_base_model
from .constants import PREVIEW_EXTENSIONS, CARD_PREVIEW_WIDTH
from ..config import config
from ..services.civitai_client import CivitaiClient
from ..utils.exif_utils import ExifUtils
from ..services.download_manager import DownloadManager

logger = logging.getLogger(__name__)


class ModelRouteUtils:
    """Shared utilities for model routes (LoRAs, Checkpoints, etc.)"""

    @staticmethod
    async def load_local_metadata(metadata_path: str) -> Dict:
        """Load local metadata file"""
        if os.path.exists(metadata_path):
            try:
                with open(metadata_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Error loading metadata from {metadata_path}: {e}")
        return {}

    @staticmethod
    async def handle_not_found_on_civitai(metadata_path: str, local_metadata: Dict) -> None:
        """Handle case when model is not found on CivitAI"""
        local_metadata['from_civitai'] = False
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(local_metadata, f, indent=2, ensure_ascii=False)

    @staticmethod
    async def update_model_metadata(metadata_path: str, local_metadata: Dict, 
                                  civitai_metadata: Dict, client: CivitaiClient) -> None:
        """Update local metadata with CivitAI data"""
        local_metadata['civitai'] = civitai_metadata
        local_metadata['from_civitai'] = True
        
        # Update model name if available
        if 'model' in civitai_metadata:
            if civitai_metadata.get('model', {}).get('name'):
                local_metadata['model_name'] = civitai_metadata['model']['name']
        
            # Fetch additional model metadata (description and tags) if we have model ID
            model_id = civitai_metadata['modelId']
            if model_id:
                model_metadata, _ = await client.get_model_metadata(str(model_id))
                if (model_metadata):
                    local_metadata['modelDescription'] = model_metadata.get('description', '')
                    local_metadata['tags'] = model_metadata.get('tags', [])
                    local_metadata['civitai']['creator'] = model_metadata['creator']
        
        # Update base model
        local_metadata['base_model'] = determine_base_model(civitai_metadata.get('baseModel'))
        
        # Update preview if needed
        if not local_metadata.get('preview_url') or not os.path.exists(local_metadata['preview_url']):
            first_preview = next((img for img in civitai_metadata.get('images', [])), None)
            if (first_preview):
                # Determine if content is video or image
                is_video = first_preview['type'] == 'video'
                
                if is_video:
                    # For videos use .mp4 extension
                    preview_ext = '.mp4'
                else:
                    # For images use .webp extension
                    preview_ext = '.webp'
                
                base_name = os.path.splitext(os.path.splitext(os.path.basename(metadata_path))[0])[0]
                preview_filename = base_name + preview_ext
                preview_path = os.path.join(os.path.dirname(metadata_path), preview_filename)
                
                if is_video:
                    # Download video as is
                    if await client.download_preview_image(first_preview['url'], preview_path):
                        local_metadata['preview_url'] = preview_path.replace(os.sep, '/')
                        local_metadata['preview_nsfw_level'] = first_preview.get('nsfwLevel', 0)
                else:
                    # For images, download and then optimize to WebP
                    temp_path = preview_path + ".temp"
                    if await client.download_preview_image(first_preview['url'], temp_path):
                        try:
                            # Read the downloaded image
                            with open(temp_path, 'rb') as f:
                                image_data = f.read()
                            
                            # Optimize and convert to WebP
                            optimized_data, _ = ExifUtils.optimize_image(
                                image_data=image_data,
                                target_width=CARD_PREVIEW_WIDTH,
                                format='webp',
                                quality=85,
                                preserve_metadata=False
                            )
                            
                            # Save the optimized WebP image
                            with open(preview_path, 'wb') as f:
                                f.write(optimized_data)
                                
                            # Update metadata
                            local_metadata['preview_url'] = preview_path.replace(os.sep, '/')
                            local_metadata['preview_nsfw_level'] = first_preview.get('nsfwLevel', 0)
                            
                            # Remove the temporary file
                            if os.path.exists(temp_path):
                                os.remove(temp_path)
                                
                        except Exception as e:
                            logger.error(f"Error optimizing preview image: {e}")
                            # If optimization fails, try to use the downloaded image directly
                            if os.path.exists(temp_path):
                                os.rename(temp_path, preview_path)
                                local_metadata['preview_url'] = preview_path.replace(os.sep, '/')
                                local_metadata['preview_nsfw_level'] = first_preview.get('nsfwLevel', 0)

        # Save updated metadata
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(local_metadata, f, indent=2, ensure_ascii=False)

    @staticmethod
    async def fetch_and_update_model(
        sha256: str, 
        file_path: str, 
        model_data: dict,
        update_cache_func: Callable[[str, str, Dict], Awaitable[bool]]
    ) -> bool:
        """Fetch and update metadata for a single model
        
        Args:
            sha256: SHA256 hash of the model file
            file_path: Path to the model file
            model_data: The model object in cache to update
            update_cache_func: Function to update the cache with new metadata
            
        Returns:
            bool: True if successful, False otherwise
        """
        client = CivitaiClient()
        try:
            # Validate input parameters
            if not isinstance(model_data, dict):
                logger.error(f"Invalid model_data type: {type(model_data)}")
                return False

            metadata_path = os.path.splitext(file_path)[0] + '.metadata.json'
            
            # Check if model metadata exists
            local_metadata = await ModelRouteUtils.load_local_metadata(metadata_path)

            # Fetch metadata from Civitai
            civitai_metadata = await client.get_model_by_hash(sha256)
            if not civitai_metadata:
                # Mark as not from CivitAI if not found
                local_metadata['from_civitai'] = False
                model_data['from_civitai'] = False
                with open(metadata_path, 'w', encoding='utf-8') as f:
                    json.dump(local_metadata, f, indent=2, ensure_ascii=False)
                return False

            # Update metadata
            await ModelRouteUtils.update_model_metadata(
                metadata_path, 
                local_metadata, 
                civitai_metadata, 
                client
            )
            
            # Update cache object directly using safe .get() method
            update_dict = {
                'model_name': local_metadata.get('model_name'),
                'preview_url': local_metadata.get('preview_url'),
                'from_civitai': True,
                'civitai': civitai_metadata
            }
            model_data.update(update_dict)
            
            # Update cache using the provided function
            await update_cache_func(file_path, file_path, local_metadata)
                
            return True

        except KeyError as e:
            logger.error(f"Error fetching CivitAI data - Missing key: {e} in model_data={model_data}")
            return False
        except Exception as e:
            logger.error(f"Error fetching CivitAI data: {str(e)}", exc_info=True)  # Include stack trace
            return False
        finally:
            await client.close()
    
    @staticmethod
    def filter_civitai_data(data: Dict) -> Dict:
        """Filter relevant fields from CivitAI data"""
        if not data:
            return {}
            
        fields = [
            "id", "modelId", "name", "createdAt", "updatedAt", 
            "publishedAt", "trainedWords", "baseModel", "description",
            "model", "images", "creator"
        ]
        return {k: data[k] for k in fields if k in data}

    @staticmethod
    async def delete_model_files(target_dir: str, file_name: str, file_monitor=None) -> List[str]:
        """Delete model and associated files
        
        Args:
            target_dir: Directory containing the model files
            file_name: Base name of the model file without extension
            file_monitor: Optional file monitor to ignore delete events
            
        Returns:
            List of deleted file paths
        """
        patterns = [
            f"{file_name}.safetensors",  # Required
            f"{file_name}.metadata.json",
        ]
        
        # Add all preview file extensions
        for ext in PREVIEW_EXTENSIONS:
            patterns.append(f"{file_name}{ext}")
        
        deleted = []
        main_file = patterns[0]
        main_path = os.path.join(target_dir, main_file).replace(os.sep, '/')
        
        if os.path.exists(main_path):
            # Notify file monitor to ignore delete event if available
            if file_monitor:
                file_monitor.handler.add_ignore_path(main_path, 0)
            
            # Delete file
            os.remove(main_path)
            deleted.append(main_path)
        else:
            logger.warning(f"Model file not found: {main_file}")
            
        # Delete optional files
        for pattern in patterns[1:]:
            path = os.path.join(target_dir, pattern)
            if os.path.exists(path):
                try:
                    os.remove(path)
                    deleted.append(pattern)
                except Exception as e:
                    logger.warning(f"Failed to delete {pattern}: {e}")
                    
        return deleted
    
    @staticmethod
    def get_multipart_ext(filename):
        """Get extension that may have multiple parts like .metadata.json"""
        parts = filename.split(".")
        if len(parts) > 2:  # If contains multi-part extension
            return "." + ".".join(parts[-2:])  # Take the last two parts, like ".metadata.json"
        return os.path.splitext(filename)[1]  # Otherwise take the regular extension, like ".safetensors"

    # New common endpoint handlers

    @staticmethod
    async def handle_delete_model(request: web.Request, scanner) -> web.Response:
        """Handle model deletion request
        
        Args:
            request: The aiohttp request
            scanner: The model scanner instance with cache management methods
            
        Returns:
            web.Response: The HTTP response
        """
        try:
            data = await request.json()
            file_path = data.get('file_path')
            if not file_path:
                return web.Response(text='Model path is required', status=400)

            target_dir = os.path.dirname(file_path)
            file_name = os.path.splitext(os.path.basename(file_path))[0]
            
            # Get the file monitor from the scanner if available
            file_monitor = getattr(scanner, 'file_monitor', None)
            
            deleted_files = await ModelRouteUtils.delete_model_files(
                target_dir, 
                file_name,
                file_monitor
            )
            
            # Remove from cache
            cache = await scanner.get_cached_data()
            cache.raw_data = [item for item in cache.raw_data if item['file_path'] != file_path]
            await cache.resort()

            # Update hash index if available
            if hasattr(scanner, '_hash_index') and scanner._hash_index:
                scanner._hash_index.remove_by_path(file_path)
            
            return web.json_response({
                'success': True,
                'deleted_files': deleted_files
            })
            
        except Exception as e:
            logger.error(f"Error deleting model: {e}", exc_info=True)
            return web.Response(text=str(e), status=500)

    @staticmethod
    async def handle_fetch_civitai(request: web.Request, scanner) -> web.Response:
        """Handle CivitAI metadata fetch request
        
        Args:
            request: The aiohttp request
            scanner: The model scanner instance with cache management methods
            
        Returns:
            web.Response: The HTTP response
        """
        try:
            data = await request.json()
            metadata_path = os.path.splitext(data['file_path'])[0] + '.metadata.json'
            
            # Check if model metadata exists
            local_metadata = await ModelRouteUtils.load_local_metadata(metadata_path)
            if not local_metadata or not local_metadata.get('sha256'):
                return web.json_response({"success": False, "error": "No SHA256 hash found"}, status=400)

            # Create a client for fetching from Civitai
            client = CivitaiClient()
            try:
                # Fetch and update metadata
                civitai_metadata = await client.get_model_by_hash(local_metadata["sha256"])
                if not civitai_metadata:
                    await ModelRouteUtils.handle_not_found_on_civitai(metadata_path, local_metadata)
                    return web.json_response({"success": False, "error": "Not found on CivitAI"}, status=404)

                await ModelRouteUtils.update_model_metadata(metadata_path, local_metadata, civitai_metadata, client)
                
                # Update the cache
                await scanner.update_single_model_cache(data['file_path'], data['file_path'], local_metadata)
                
                return web.json_response({"success": True})
            finally:
                await client.close()

        except Exception as e:
            logger.error(f"Error fetching from CivitAI: {e}", exc_info=True)
            return web.json_response({"success": False, "error": str(e)}, status=500)

    @staticmethod
    async def handle_replace_preview(request: web.Request, scanner) -> web.Response:
        """Handle preview image replacement request
        
        Args:
            request: The aiohttp request
            scanner: The model scanner instance with methods to update cache
            
        Returns:
            web.Response: The HTTP response
        """
        try:
            reader = await request.multipart()
            
            # Read preview file data
            field = await reader.next()
            if field.name != 'preview_file':
                raise ValueError("Expected 'preview_file' field")
            content_type = field.headers.get('Content-Type', 'image/png')
            preview_data = await field.read()
            
            # Read model path
            field = await reader.next()
            if field.name != 'model_path':
                raise ValueError("Expected 'model_path' field")
            model_path = (await field.read()).decode()
            
            # Save preview file
            base_name = os.path.splitext(os.path.basename(model_path))[0]
            folder = os.path.dirname(model_path)
            
            # Determine if content is video or image
            if content_type.startswith('video/'):
                # For videos, keep original format and use .mp4 extension
                extension = '.mp4'
                optimized_data = preview_data
            else:
                # For images, optimize and convert to WebP
                optimized_data, _ = ExifUtils.optimize_image(
                    image_data=preview_data,
                    target_width=CARD_PREVIEW_WIDTH,
                    format='webp',
                    quality=85,
                    preserve_metadata=False
                )
                extension = '.webp'  # Use .webp without .preview part
            
            preview_path = os.path.join(folder, base_name + extension).replace(os.sep, '/')
            
            with open(preview_path, 'wb') as f:
                f.write(optimized_data)
            
            # Update preview path in metadata
            metadata_path = os.path.splitext(model_path)[0] + '.metadata.json'
            if os.path.exists(metadata_path):
                try:
                    with open(metadata_path, 'r', encoding='utf-8') as f:
                        metadata = json.load(f)
                    
                    # Update preview_url directly in the metadata dict
                    metadata['preview_url'] = preview_path
                    
                    with open(metadata_path, 'w', encoding='utf-8') as f:
                        json.dump(metadata, f, indent=2, ensure_ascii=False)
                except Exception as e:
                    logger.error(f"Error updating metadata: {e}")
            
            # Update preview URL in scanner cache
            if hasattr(scanner, 'update_preview_in_cache'):
                await scanner.update_preview_in_cache(model_path, preview_path)
            
            return web.json_response({
                "success": True,
                "preview_url": config.get_preview_static_url(preview_path)
            })
            
        except Exception as e:
            logger.error(f"Error replacing preview: {e}", exc_info=True)
            return web.Response(text=str(e), status=500)

    @staticmethod
    async def handle_exclude_model(request: web.Request, scanner) -> web.Response:
        """Handle model exclusion request
        
        Args:
            request: The aiohttp request
            scanner: The model scanner instance with cache management methods
            
        Returns:
            web.Response: The HTTP response
        """
        try:
            data = await request.json()
            file_path = data.get('file_path')
            if not file_path:
                return web.Response(text='Model path is required', status=400)

            # Update metadata to mark as excluded
            metadata_path = os.path.splitext(file_path)[0] + '.metadata.json'
            metadata = await ModelRouteUtils.load_local_metadata(metadata_path)
            metadata['exclude'] = True
            
            # Save updated metadata
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)

            # Update cache
            cache = await scanner.get_cached_data()

            # Find and remove model from cache
            model_to_remove = next((item for item in cache.raw_data if item['file_path'] == file_path), None)
            if model_to_remove:
                # Update tags count
                for tag in model_to_remove.get('tags', []):
                    if tag in scanner._tags_count:
                        scanner._tags_count[tag] = max(0, scanner._tags_count[tag] - 1)
                        if scanner._tags_count[tag] == 0:
                            del scanner._tags_count[tag]

                # Remove from hash index if available
                if hasattr(scanner, '_hash_index') and scanner._hash_index:
                    scanner._hash_index.remove_by_path(file_path)

                # Remove from cache data
                cache.raw_data = [item for item in cache.raw_data if item['file_path'] != file_path]
                await cache.resort()
            
            # Add to excluded models list
            scanner._excluded_models.append(file_path)
            
            return web.json_response({
                'success': True,
                'message': f"Model {os.path.basename(file_path)} excluded"
            })
            
        except Exception as e:
            logger.error(f"Error excluding model: {e}", exc_info=True)
            return web.Response(text=str(e), status=500)

    @staticmethod
    async def handle_download_model(request: web.Request, download_manager: DownloadManager, model_type="lora") -> web.Response:
        """Handle model download request
        
        Args:
            request: The aiohttp request
            download_manager: Instance of DownloadManager
            model_type: Type of model ('lora' or 'checkpoint')
            
        Returns:
            web.Response: The HTTP response
        """
        try:
            data = await request.json()
            
            # Create progress callback
            async def progress_callback(progress):
                from ..services.websocket_manager import ws_manager
                await ws_manager.broadcast({
                    'status': 'progress',
                    'progress': progress
                })
            
            # Check which identifier is provided
            download_url = data.get('download_url')
            model_hash = data.get('model_hash')
            model_version_id = data.get('model_version_id')
            
            # Validate that at least one identifier is provided
            if not any([download_url, model_hash, model_version_id]):
                return web.Response(
                    status=400, 
                    text="Missing required parameter: Please provide either 'download_url', 'hash', or 'modelVersionId'"
                )
            
            # Use the correct root directory based on model type
            root_key = 'checkpoint_root' if model_type == 'checkpoint' else 'lora_root'
            save_dir = data.get(root_key)
            
            result = await download_manager.download_from_civitai(
                download_url=download_url,
                model_hash=model_hash,
                model_version_id=model_version_id,
                save_dir=save_dir,
                relative_path=data.get('relative_path', ''),
                progress_callback=progress_callback,
                model_type=model_type
            )
            
            if not result.get('success', False):
                error_message = result.get('error', 'Unknown error')
                
                # Return 401 for early access errors
                if 'early access' in error_message.lower():
                    logger.warning(f"Early access download failed: {error_message}")
                    return web.Response(
                        status=401,  # Use 401 status code to match Civitai's response
                        text=f"Early Access Restriction: {error_message}"
                    )
                
                return web.Response(status=500, text=error_message)
            
            return web.json_response(result)
            
        except Exception as e:
            error_message = str(e)
            
            # Check if this might be an early access error
            if '401' in error_message:
                logger.warning(f"Early access error (401): {error_message}")
                return web.Response(
                    status=401,
                    text="Early Access Restriction: This model requires purchase. Please buy early access on Civitai.com."
                )
            
            logger.error(f"Error downloading {model_type}: {error_message}")
            return web.Response(status=500, text=error_message)

    @staticmethod
    async def handle_bulk_delete_models(request: web.Request, scanner) -> web.Response:
        """Handle bulk deletion of models
        
        Args:
            request: The aiohttp request
            scanner: The model scanner instance with cache management methods
            
        Returns:
            web.Response: The HTTP response
        """
        try:
            data = await request.json()
            file_paths = data.get('file_paths', [])
            
            if not file_paths:
                return web.json_response({
                    'success': False, 
                    'error': 'No file paths provided for deletion'
                }, status=400)
            
            # Use the scanner's bulk delete method to handle all cache and file operations
            result = await scanner.bulk_delete_models(file_paths)
            
            return web.json_response({
                'success': result.get('success', False),
                'total_deleted': result.get('total_deleted', 0),
                'total_attempted': result.get('total_attempted', len(file_paths)),
                'results': result.get('results', [])
            })
            
        except Exception as e:
            logger.error(f"Error in bulk delete: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)
    