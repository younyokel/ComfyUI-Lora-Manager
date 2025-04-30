import os
import json
import logging
from aiohttp import web
from typing import Dict
from server import PromptServer # type: ignore

from ..utils.routes_common import ModelRouteUtils
from ..nodes.utils import get_lora_info

from ..config import config
from ..services.websocket_manager import ws_manager
from ..services.settings_manager import settings
import asyncio
from .update_routes import UpdateRoutes
from ..utils.constants import PREVIEW_EXTENSIONS, CARD_PREVIEW_WIDTH
from ..utils.exif_utils import ExifUtils
from ..services.service_registry import ServiceRegistry

logger = logging.getLogger(__name__)

class ApiRoutes:
    """API route handlers for LoRA management"""

    def __init__(self):
        self.scanner = None  # Will be initialized in setup_routes
        self.civitai_client = None  # Will be initialized in setup_routes
        self.download_manager = None  # Will be initialized in setup_routes
        self._download_lock = asyncio.Lock()

    async def initialize_services(self):
        """Initialize services from ServiceRegistry"""
        self.scanner = await ServiceRegistry.get_lora_scanner()
        self.civitai_client = await ServiceRegistry.get_civitai_client()
        self.download_manager = await ServiceRegistry.get_download_manager()

    @classmethod
    def setup_routes(cls, app: web.Application):
        """Register API routes"""
        routes = cls()
        
        # Schedule service initialization on app startup
        app.on_startup.append(lambda _: routes.initialize_services())
        
        app.router.add_post('/api/delete_model', routes.delete_model)
        app.router.add_post('/api/fetch-civitai', routes.fetch_civitai)
        app.router.add_post('/api/replace_preview', routes.replace_preview)
        app.router.add_get('/api/loras', routes.get_loras)
        app.router.add_post('/api/fetch-all-civitai', routes.fetch_all_civitai)
        app.router.add_get('/ws/fetch-progress', ws_manager.handle_connection)
        app.router.add_get('/ws/init-progress', ws_manager.handle_init_connection)  # Add new WebSocket route
        app.router.add_get('/api/lora-roots', routes.get_lora_roots)
        app.router.add_get('/api/folders', routes.get_folders)
        app.router.add_get('/api/civitai/versions/{model_id}', routes.get_civitai_versions)
        app.router.add_get('/api/civitai/model/version/{modelVersionId}', routes.get_civitai_model_by_version)
        app.router.add_get('/api/civitai/model/hash/{hash}', routes.get_civitai_model_by_hash)
        app.router.add_post('/api/download-lora', routes.download_lora)
        app.router.add_post('/api/move_model', routes.move_model)
        app.router.add_get('/api/lora-model-description', routes.get_lora_model_description)  # Add new route
        app.router.add_post('/api/loras/save-metadata', routes.save_metadata)
        app.router.add_get('/api/lora-preview-url', routes.get_lora_preview_url)  # Add new route
        app.router.add_post('/api/move_models_bulk', routes.move_models_bulk)
        app.router.add_get('/api/loras/top-tags', routes.get_top_tags)  # Add new route for top tags
        app.router.add_get('/api/loras/base-models', routes.get_base_models)  # Add new route for base models
        app.router.add_get('/api/lora-civitai-url', routes.get_lora_civitai_url)  # Add new route for Civitai URL
        app.router.add_post('/api/rename_lora', routes.rename_lora)  # Add new route for renaming LoRA files
        app.router.add_get('/api/loras/scan', routes.scan_loras)  # Add new route for scanning LoRA files
        
        # Add the new trigger words route
        app.router.add_post('/loramanager/get_trigger_words', routes.get_trigger_words)

        # Add update check routes
        UpdateRoutes.setup_routes(app)

    async def delete_model(self, request: web.Request) -> web.Response:
        """Handle model deletion request"""
        if self.scanner is None:
            self.scanner = await ServiceRegistry.get_lora_scanner()
        return await ModelRouteUtils.handle_delete_model(request, self.scanner)

    async def fetch_civitai(self, request: web.Request) -> web.Response:
        """Handle CivitAI metadata fetch request"""
        if self.scanner is None:
            self.scanner = await ServiceRegistry.get_lora_scanner()
        return await ModelRouteUtils.handle_fetch_civitai(request, self.scanner)

    async def replace_preview(self, request: web.Request) -> web.Response:
        """Handle preview image replacement request"""
        if self.scanner is None:
            self.scanner = await ServiceRegistry.get_lora_scanner()
        return await ModelRouteUtils.handle_replace_preview(request, self.scanner)
    
    async def scan_loras(self, request: web.Request) -> web.Response:
        """Force a rescan of LoRA files"""
        try:                
            await self.scanner.get_cached_data(force_refresh=True)
            return web.json_response({"status": "success", "message": "LoRA scan completed"})
        except Exception as e:
            logger.error(f"Error in scan_loras: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def get_loras(self, request: web.Request) -> web.Response:
        """Handle paginated LoRA data request"""
        try:
            if self.scanner is None:
                self.scanner = await ServiceRegistry.get_lora_scanner()
                
            # Parse query parameters
            page = int(request.query.get('page', '1'))
            page_size = int(request.query.get('page_size', '20'))
            sort_by = request.query.get('sort_by', 'name')
            folder = request.query.get('folder', None)
            search = request.query.get('search', None)
            fuzzy_search = request.query.get('fuzzy', 'false').lower() == 'true'
            
            # Parse search options
            search_options = {
                'filename': request.query.get('search_filename', 'true').lower() == 'true',
                'modelname': request.query.get('search_modelname', 'true').lower() == 'true',
                'tags': request.query.get('search_tags', 'false').lower() == 'true',
                'recursive': request.query.get('recursive', 'false').lower() == 'true'
            }
            
            # Get filter parameters
            base_models = request.query.get('base_models', None)
            tags = request.query.get('tags', None)
            favorites_only = request.query.get('favorites_only', 'false').lower() == 'true'  # New parameter
            
            # New parameters for recipe filtering
            lora_hash = request.query.get('lora_hash', None)
            lora_hashes = request.query.get('lora_hashes', None)
            
            # Parse filter parameters
            filters = {}
            if base_models:
                filters['base_model'] = base_models.split(',')
            if tags:
                filters['tags'] = tags.split(',')
            
            # Add lora hash filtering options
            hash_filters = {}
            if lora_hash:
                hash_filters['single_hash'] = lora_hash.lower()
            elif lora_hashes:
                hash_filters['multiple_hashes'] = [h.lower() for h in lora_hashes.split(',')]
            
            # Get file data
            data = await self.scanner.get_paginated_data(
                page, 
                page_size, 
                sort_by=sort_by, 
                folder=folder,
                search=search,
                fuzzy_search=fuzzy_search,
                base_models=filters.get('base_model', None),
                tags=filters.get('tags', None),
                search_options=search_options,
                hash_filters=hash_filters,
                favorites_only=favorites_only  # Pass favorites_only parameter
            )

            # Get all available folders from cache
            cache = await self.scanner.get_cached_data()
            
            # Convert output to match expected format
            result = {
                'items': [self._format_lora_response(lora) for lora in data['items']],
                'folders': cache.folders,
                'total': data['total'],
                'page': data['page'],
                'page_size': data['page_size'],
                'total_pages': data['total_pages']
            }
            
            return web.json_response(result)
            
        except Exception as e:
            logger.error(f"Error retrieving loras: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    def _format_lora_response(self, lora: Dict) -> Dict:
        """Format LoRA data for API response"""
        return {
            "model_name": lora["model_name"],
            "file_name": lora["file_name"],
            "preview_url": config.get_preview_static_url(lora["preview_url"]),
            "preview_nsfw_level": lora.get("preview_nsfw_level", 0),
            "base_model": lora["base_model"],
            "folder": lora["folder"],
            "sha256": lora["sha256"],
            "file_path": lora["file_path"].replace(os.sep, "/"),
            "file_size": lora["size"],
            "modified": lora["modified"],
            "tags": lora["tags"],
            "modelDescription": lora["modelDescription"],
            "from_civitai": lora.get("from_civitai", True),
            "usage_tips": lora.get("usage_tips", ""),
            "notes": lora.get("notes", ""),
            "favorite": lora.get("favorite", False),  # Include favorite status in response
            "civitai": ModelRouteUtils.filter_civitai_data(lora.get("civitai", {}))
        }

    # Private helper methods
    async def _read_preview_file(self, reader) -> tuple[bytes, str]:
        """Read preview file and content type from multipart request"""
        field = await reader.next()
        if field.name != 'preview_file':
            raise ValueError("Expected 'preview_file' field")
        content_type = field.headers.get('Content-Type', 'image/png')
        return await field.read(), content_type

    async def _read_model_path(self, reader) -> str:
        """Read model path from multipart request"""
        field = await reader.next()
        if field.name != 'model_path':
            raise ValueError("Expected 'model_path' field")
        return (await field.read()).decode()

    async def _save_preview_file(self, model_path: str, preview_data: bytes, content_type: str) -> str:
        """Save preview file and return its path"""
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
            
        return preview_path

    async def _update_preview_metadata(self, model_path: str, preview_path: str):
        """Update preview path in metadata"""
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

    async def fetch_all_civitai(self, request: web.Request) -> web.Response:
        """Fetch CivitAI metadata for all loras in the background"""
        try:
            if self.scanner is None:
                self.scanner = await ServiceRegistry.get_lora_scanner()
                
            cache = await self.scanner.get_cached_data()
            total = len(cache.raw_data)
            processed = 0
            success = 0
            needs_resort = False
            
            # Prepare loras to process
            to_process = [
                lora for lora in cache.raw_data 
                if lora.get('sha256') and (not lora.get('civitai') or 'id' not in lora.get('civitai')) and lora.get('from_civitai', True)  # TODO: for lora not from CivitAI but added traineWords
            ]
            total_to_process = len(to_process)
            
            # Send initial progress
            await ws_manager.broadcast({
                'status': 'started',
                'total': total_to_process,
                'processed': 0,
                'success': 0
            })
            
            for lora in to_process:
                try:
                    original_name = lora.get('model_name')
                    if await ModelRouteUtils.fetch_and_update_model(
                        sha256=lora['sha256'],
                        file_path=lora['file_path'],
                        model_data=lora,
                        update_cache_func=self.scanner.update_single_model_cache
                    ):
                        success += 1
                        if original_name != lora.get('model_name'):
                            needs_resort = True
                    
                    processed += 1
                    
                    # Send progress update
                    await ws_manager.broadcast({
                        'status': 'processing',
                        'total': total_to_process,
                        'processed': processed,
                        'success': success,
                        'current_name': lora.get('model_name', 'Unknown')
                    })
                    
                except Exception as e:
                    logger.error(f"Error fetching CivitAI data for {lora['file_path']}: {e}")
            
            if needs_resort:
                await cache.resort(name_only=True)
            
            # Send completion message
            await ws_manager.broadcast({
                'status': 'completed',
                'total': total_to_process,
                'processed': processed,
                'success': success
            })
                    
            return web.json_response({
                "success": True,
                "message": f"Successfully updated {success} of {processed} processed loras (total: {total})"
            })
            
        except Exception as e:
            # Send error message
            await ws_manager.broadcast({
                'status': 'error',
                'error': str(e)
            })
            logger.error(f"Error in fetch_all_civitai: {e}")
            return web.Response(text=str(e), status=500)

    async def get_lora_roots(self, request: web.Request) -> web.Response:
        """Get all configured LoRA root directories"""
        return web.json_response({
            'roots': config.loras_roots
        })
    
    async def get_folders(self, request: web.Request) -> web.Response:
        """Get all folders in the cache"""
        if self.scanner is None:
            self.scanner = await ServiceRegistry.get_lora_scanner()
            
        cache = await self.scanner.get_cached_data()
        return web.json_response({
            'folders': cache.folders
        })

    async def get_civitai_versions(self, request: web.Request) -> web.Response:
        """Get available versions for a Civitai model with local availability info"""
        try:
            if self.scanner is None:
                self.scanner = await ServiceRegistry.get_lora_scanner()
                
            if self.civitai_client is None:
                self.civitai_client = await ServiceRegistry.get_civitai_client()
                
            model_id = request.match_info['model_id']
            response = await self.civitai_client.get_model_versions(model_id)
            if not response or not response.get('modelVersions'):
                return web.Response(status=404, text="Model not found")
            
            versions = response.get('modelVersions', [])
            model_type = response.get('type', '')
            
            # Check model type - should be LORA
            if model_type.lower() != 'lora':
                return web.json_response({
                    'error': f"Model type mismatch. Expected LORA, got {model_type}"
                }, status=400)
            
            # Check local availability for each version
            for version in versions:
                # Find the model file (type="Model") in the files list
                model_file = next((file for file in version.get('files', []) 
                                  if file.get('type') == 'Model'), None)
                
                if model_file:
                    sha256 = model_file.get('hashes', {}).get('SHA256')
                    if sha256:
                        # Set existsLocally and localPath at the version level
                        version['existsLocally'] = self.scanner.has_hash(sha256)
                        if version['existsLocally']:
                            version['localPath'] = self.scanner.get_path_by_hash(sha256)
                        
                        # Also set the model file size at the version level for easier access
                        version['modelSizeKB'] = model_file.get('sizeKB')
                else:
                    # No model file found in this version
                    version['existsLocally'] = False
                    
            return web.json_response(versions)
        except Exception as e:
            logger.error(f"Error fetching model versions: {e}")
            return web.Response(status=500, text=str(e))
        
    async def get_civitai_model_by_version(self, request: web.Request) -> web.Response:
        """Get CivitAI model details by model version ID"""
        try:
            if self.civitai_client is None:
                self.civitai_client = await ServiceRegistry.get_civitai_client()
                
            model_version_id = request.match_info.get('modelVersionId')
            
            # Get model details from Civitai API    
            model, error_msg = await self.civitai_client.get_model_version_info(model_version_id)
            
            if not model:
                # Log warning for failed model retrieval
                logger.warning(f"Failed to fetch model version {model_version_id}: {error_msg}")
                
                # Determine status code based on error message
                status_code = 404 if error_msg and "not found" in error_msg.lower() else 500
                
                return web.json_response({
                    "success": False,
                    "error": error_msg or "Failed to fetch model information"
                }, status=status_code)
                
            return web.json_response(model)
        except Exception as e:
            logger.error(f"Error fetching model details: {e}")
            return web.json_response({
                "success": False,
                "error": str(e)
            }, status=500)

    async def get_civitai_model_by_hash(self, request: web.Request) -> web.Response:
        """Get CivitAI model details by hash"""
        try:
            if self.civitai_client is None:
                self.civitai_client = await ServiceRegistry.get_civitai_client()
                
            hash = request.match_info.get('hash')
            model = await self.civitai_client.get_model_by_hash(hash)
            return web.json_response(model)
        except Exception as e:
            logger.error(f"Error fetching model details by hash: {e}")
            return web.json_response({
                "success": False,
                "error": str(e)
            }, status=500)

    async def download_lora(self, request: web.Request) -> web.Response:
        async with self._download_lock:
            try:
                if self.download_manager is None:
                    self.download_manager = await ServiceRegistry.get_download_manager()
                
                data = await request.json()
                
                # Create progress callback
                async def progress_callback(progress):
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
                
                result = await self.download_manager.download_from_civitai(
                    download_url=download_url,
                    model_hash=model_hash,
                    model_version_id=model_version_id,
                    save_dir=data.get('lora_root'),
                    relative_path=data.get('relative_path'),
                    progress_callback=progress_callback
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
                        text="Early Access Restriction: This LoRA requires purchase. Please buy early access on Civitai.com."
                    )
                
                logger.error(f"Error downloading LoRA: {error_message}")
                return web.Response(status=500, text=error_message)


    async def move_model(self, request: web.Request) -> web.Response:
        """Handle model move request"""
        try:
            if self.scanner is None:
                self.scanner = await ServiceRegistry.get_lora_scanner()
                
            data = await request.json()
            file_path = data.get('file_path') # full path of the model file, e.g. /path/to/model.safetensors
            target_path = data.get('target_path') # folder path to move the model to, e.g. /path/to/target_folder
            
            if not file_path or not target_path:
                return web.Response(text='File path and target path are required', status=400)

            # Check if source and destination are the same
            source_dir = os.path.dirname(file_path)
            if os.path.normpath(source_dir) == os.path.normpath(target_path):
                logger.info(f"Source and target directories are the same: {source_dir}")
                return web.json_response({'success': True, 'message': 'Source and target directories are the same'})

            # Check if target file already exists
            file_name = os.path.basename(file_path)
            target_file_path = os.path.join(target_path, file_name).replace(os.sep, '/')
            
            if os.path.exists(target_file_path):
                return web.json_response({
                    'success': False, 
                    'error': f"Target file already exists: {target_file_path}"
                }, status=409)  # 409 Conflict

            # Call scanner to handle the move operation
            success = await self.scanner.move_model(file_path, target_path)
            
            if success:
                return web.json_response({'success': True})
            else:
                return web.Response(text='Failed to move model', status=500)
                
        except Exception as e:
            logger.error(f"Error moving model: {e}", exc_info=True)
            return web.Response(text=str(e), status=500)

    @classmethod
    async def cleanup(cls):
        """Add cleanup method for application shutdown"""
        # Now we don't need to store an instance, as services are managed by ServiceRegistry
        civitai_client = await ServiceRegistry.get_civitai_client()
        if civitai_client:
            await civitai_client.close()

    async def save_metadata(self, request: web.Request) -> web.Response:
        """Handle saving metadata updates"""
        try:
            if self.scanner is None:
                self.scanner = await ServiceRegistry.get_lora_scanner()
                
            data = await request.json()
            file_path = data.get('file_path')
            if not file_path:
                return web.Response(text='File path is required', status=400)

            # Remove file path from data to avoid saving it
            metadata_updates = {k: v for k, v in data.items() if k != 'file_path'}
            
            # Get metadata file path
            metadata_path = os.path.splitext(file_path)[0] + '.metadata.json'
            
            # Load existing metadata
            metadata = await ModelRouteUtils.load_local_metadata(metadata_path)

            # Handle nested updates (for civitai.trainedWords)
            for key, value in metadata_updates.items():
                if isinstance(value, dict) and key in metadata and isinstance(metadata[key], dict):
                    # Deep update for nested dictionaries
                    for nested_key, nested_value in value.items():
                        metadata[key][nested_key] = nested_value
                else:
                    # Regular update for top-level keys
                    metadata[key] = value

            # Save updated metadata
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)

            # Update cache
            await self.scanner.update_single_model_cache(file_path, file_path, metadata)

            # If model_name was updated, resort the cache
            if 'model_name' in metadata_updates:
                cache = await self.scanner.get_cached_data()
                await cache.resort(name_only=True)

            return web.json_response({'success': True})

        except Exception as e:
            logger.error(f"Error saving metadata: {e}", exc_info=True)
            return web.Response(text=str(e), status=500)

    async def get_lora_preview_url(self, request: web.Request) -> web.Response:
        """Get the static preview URL for a LoRA file"""
        try:
            if self.scanner is None:
                self.scanner = await ServiceRegistry.get_lora_scanner()
                
            # Get lora file name from query parameters
            lora_name = request.query.get('name')
            if not lora_name:
                return web.Response(text='Lora file name is required', status=400)

            # Get cache data
            cache = await self.scanner.get_cached_data()
            
            # Search for the lora in cache data
            for lora in cache.raw_data:
                file_name = lora['file_name']
                if file_name == lora_name:
                    if preview_url := lora.get('preview_url'):
                        # Convert preview path to static URL
                        static_url = config.get_preview_static_url(preview_url)
                        if static_url:
                            return web.json_response({
                                'success': True,
                                'preview_url': static_url
                            })
                    break

            # If no preview URL found
            return web.json_response({
                'success': False,
                'error': 'No preview URL found for the specified lora'
            }, status=404)

        except Exception as e:
            logger.error(f"Error getting lora preview URL: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)

    async def get_lora_civitai_url(self, request: web.Request) -> web.Response:
        """Get the Civitai URL for a LoRA file"""
        try:
            if self.scanner is None:
                self.scanner = await ServiceRegistry.get_lora_scanner()
                
            # Get lora file name from query parameters
            lora_name = request.query.get('name')
            if not lora_name:
                return web.Response(text='Lora file name is required', status=400)

            # Get cache data
            cache = await self.scanner.get_cached_data()
            
            # Search for the lora in cache data
            for lora in cache.raw_data:
                file_name = lora['file_name']
                if file_name == lora_name:
                    civitai_data = lora.get('civitai', {})
                    model_id = civitai_data.get('modelId')
                    version_id = civitai_data.get('id')
                    
                    if model_id:
                        civitai_url = f"https://civitai.com/models/{model_id}"
                        if version_id:
                            civitai_url += f"?modelVersionId={version_id}"
                            
                        return web.json_response({
                            'success': True,
                            'civitai_url': civitai_url,
                            'model_id': model_id,
                            'version_id': version_id
                        })
                    break

            # If no Civitai data found
            return web.json_response({
                'success': False,
                'error': 'No Civitai data found for the specified lora'
            }, status=404)

        except Exception as e:
            logger.error(f"Error getting lora Civitai URL: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)

    async def move_models_bulk(self, request: web.Request) -> web.Response:
        """Handle bulk model move request"""
        try:
            if self.scanner is None:
                self.scanner = await ServiceRegistry.get_lora_scanner()
                
            data = await request.json()
            file_paths = data.get('file_paths', []) # list of full paths of the model files, e.g. ["/path/to/model1.safetensors", "/path/to/model2.safetensors"]
            target_path = data.get('target_path') # folder path to move the models to, e.g. "/path/to/target_folder"
            
            if not file_paths or not target_path:
                return web.Response(text='File paths and target path are required', status=400)

            results = []
            for file_path in file_paths:
                # Check if source and destination are the same
                source_dir = os.path.dirname(file_path)
                if os.path.normpath(source_dir) == os.path.normpath(target_path):
                    results.append({
                        "path": file_path, 
                        "success": True, 
                        "message": "Source and target directories are the same"
                    })
                    continue
                
                # Check if target file already exists
                file_name = os.path.basename(file_path)
                target_file_path = os.path.join(target_path, file_name).replace(os.sep, '/')
                
                if os.path.exists(target_file_path):
                    results.append({
                        "path": file_path, 
                        "success": False, 
                        "message": f"Target file already exists: {target_file_path}"
                    })
                    continue
                
                # Try to move the model
                success = await self.scanner.move_model(file_path, target_path)
                results.append({
                    "path": file_path, 
                    "success": success,
                    "message": "Success" if success else "Failed to move model"
                })
            
            # Count successes and failures
            success_count = sum(1 for r in results if r["success"])
            failure_count = len(results) - success_count
            
            return web.json_response({
                'success': True,
                'message': f'Moved {success_count} of {len(file_paths)} models',
                'results': results,
                'success_count': success_count,
                'failure_count': failure_count
            })
                
        except Exception as e:
            logger.error(f"Error moving models in bulk: {e}", exc_info=True)
            return web.Response(text=str(e), status=500)

    async def get_lora_model_description(self, request: web.Request) -> web.Response:
        """Get model description for a Lora model"""
        try:
            if self.civitai_client is None:
                self.civitai_client = await ServiceRegistry.get_civitai_client()
                
            # Get parameters
            model_id = request.query.get('model_id')
            file_path = request.query.get('file_path')
            
            if not model_id:
                return web.json_response({
                    'success': False, 
                    'error': 'Model ID is required'
                }, status=400)
            
            # Check if we already have the description stored in metadata
            description = None
            tags = []
            if file_path:
                metadata_path = os.path.splitext(file_path)[0] + '.metadata.json'
                metadata = await ModelRouteUtils.load_local_metadata(metadata_path)
                description = metadata.get('modelDescription')
                tags = metadata.get('tags', [])
            
            # If description is not in metadata, fetch from CivitAI
            if not description:
                logger.info(f"Fetching model metadata for model ID: {model_id}")
                model_metadata, _ = await self.civitai_client.get_model_metadata(model_id)
                
                if (model_metadata):
                    description = model_metadata.get('description')
                    tags = model_metadata.get('tags', [])
                
                    # Save the metadata to file if we have a file path and got metadata
                    if file_path:
                        try:
                            metadata_path = os.path.splitext(file_path)[0] + '.metadata.json'
                            metadata = await ModelRouteUtils.load_local_metadata(metadata_path)
                            
                            metadata['modelDescription'] = description
                            metadata['tags'] = tags
                            
                            with open(metadata_path, 'w', encoding='utf-8') as f:
                                json.dump(metadata, f, indent=2, ensure_ascii=False)
                                logger.info(f"Saved model metadata to file for {file_path}")
                        except Exception as e:
                            logger.error(f"Error saving model metadata: {e}")
            
            return web.json_response({
                'success': True,
                'description': description or "<p>No model description available.</p>",
                'tags': tags
            })
            
        except Exception as e:
            logger.error(f"Error getting model metadata: {e}")
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)

    async def get_top_tags(self, request: web.Request) -> web.Response:
        """Handle request for top tags sorted by frequency"""
        try:
            if self.scanner is None:
                self.scanner = await ServiceRegistry.get_lora_scanner()
                
            # Parse query parameters
            limit = int(request.query.get('limit', '20'))
            
            # Validate limit
            if limit < 1 or limit > 100:
                limit = 20  # Default to a reasonable limit
                
            # Get top tags
            top_tags = await self.scanner.get_top_tags(limit)
            
            return web.json_response({
                'success': True,
                'tags': top_tags
            })
            
        except Exception as e:
            logger.error(f"Error getting top tags: {str(e)}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': 'Internal server error'
            }, status=500)

    async def get_base_models(self, request: web.Request) -> web.Response:
        """Get base models used in loras"""
        try:
            if self.scanner is None:
                self.scanner = await ServiceRegistry.get_lora_scanner()
                
            # Parse query parameters
            limit = int(request.query.get('limit', '20'))
            
            # Validate limit
            if limit < 1 or limit > 100:
                limit = 20  # Default to a reasonable limit
                
            # Get base models
            base_models = await self.scanner.get_base_models(limit)
            
            return web.json_response({
                'success': True,
                'base_models': base_models
            })
        except Exception as e:
            logger.error(f"Error retrieving base models: {e}")
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)

    async def rename_lora(self, request: web.Request) -> web.Response:
        """Handle renaming a LoRA file and its associated files"""
        try:
            if self.scanner is None:
                self.scanner = await ServiceRegistry.get_lora_scanner()
                
            if self.download_manager is None:
                self.download_manager = await ServiceRegistry.get_download_manager()
                
            data = await request.json()
            file_path = data.get('file_path')
            new_file_name = data.get('new_file_name')
            
            if not file_path or not new_file_name:
                return web.json_response({
                    'success': False,
                    'error': 'File path and new file name are required'
                }, status=400)
            
            # Validate the new file name (no path separators or invalid characters)
            invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']
            if any(char in new_file_name for char in invalid_chars):
                return web.json_response({
                    'success': False,
                    'error': 'Invalid characters in file name'
                }, status=400)
            
            # Get the directory and current file name
            target_dir = os.path.dirname(file_path)
            old_file_name = os.path.splitext(os.path.basename(file_path))[0]
            
            # Check if the target file already exists
            new_file_path = os.path.join(target_dir, f"{new_file_name}.safetensors").replace(os.sep, '/')
            if os.path.exists(new_file_path):
                return web.json_response({
                    'success': False,
                    'error': 'A file with this name already exists'
                }, status=400)
            
            # Define the patterns for associated files
            patterns = [
                f"{old_file_name}.safetensors",  # Required
                f"{old_file_name}.metadata.json",
            ]
            
            # Add all preview file extensions
            for ext in PREVIEW_EXTENSIONS:
                patterns.append(f"{old_file_name}{ext}")
            
            # Find all matching files
            existing_files = []
            for pattern in patterns:
                path = os.path.join(target_dir, pattern)
                if os.path.exists(path):
                    existing_files.append((path, pattern))
            
            # Get the hash from the main file to update hash index
            hash_value = None
            metadata = None
            metadata_path = os.path.join(target_dir, f"{old_file_name}.metadata.json")
            
            if os.path.exists(metadata_path):
                metadata = await ModelRouteUtils.load_local_metadata(metadata_path)
                hash_value = metadata.get('sha256')
            
            # Rename all files
            renamed_files = []
            new_metadata_path = None
            
            # Notify file monitor to ignore these events
            main_file_path = os.path.join(target_dir, f"{old_file_name}.safetensors")
            if os.path.exists(main_file_path):
                # Get lora monitor through ServiceRegistry instead of download_manager
                lora_monitor = await ServiceRegistry.get_lora_monitor()
                if lora_monitor:
                    # Add old and new paths to ignore list
                    file_size = os.path.getsize(main_file_path)
                    lora_monitor.handler.add_ignore_path(main_file_path, file_size)
                    lora_monitor.handler.add_ignore_path(new_file_path, file_size)
            
            for old_path, pattern in existing_files:
                # Get the file extension like .safetensors or .metadata.json
                ext = ModelRouteUtils.get_multipart_ext(pattern)

                # Create the new path
                new_path = os.path.join(target_dir, f"{new_file_name}{ext}").replace(os.sep, '/')
                
                # Rename the file
                os.rename(old_path, new_path)
                renamed_files.append(new_path)
                
                # Keep track of metadata path for later update
                if ext == '.metadata.json':
                    new_metadata_path = new_path
            
            # Update the metadata file with new file name and paths
            if new_metadata_path and metadata:
                # Update file_name, file_path and preview_url in metadata
                metadata['file_name'] = new_file_name
                metadata['file_path'] = new_file_path
                
                # Update preview_url if it exists
                if 'preview_url' in metadata and metadata['preview_url']:
                    old_preview = metadata['preview_url']
                    ext = ModelRouteUtils.get_multipart_ext(old_preview)
                    new_preview = os.path.join(target_dir, f"{new_file_name}{ext}").replace(os.sep, '/')
                    metadata['preview_url'] = new_preview
                
                # Save updated metadata
                with open(new_metadata_path, 'w', encoding='utf-8') as f:
                    json.dump(metadata, f, indent=2, ensure_ascii=False)
            
            # Update the scanner cache
            if metadata:
                await self.scanner.update_single_model_cache(file_path, new_file_path, metadata)
                
                # Update recipe files and cache if hash is available
                if hash_value:
                    recipe_scanner = await ServiceRegistry.get_recipe_scanner()
                    recipes_updated, cache_updated = await recipe_scanner.update_lora_filename_by_hash(hash_value, new_file_name)
                    logger.info(f"Updated {recipes_updated} recipe files and {cache_updated} cache entries for renamed LoRA")
            
            return web.json_response({
                'success': True,
                'new_file_path': new_file_path,
                'renamed_files': renamed_files,
                'reload_required': False
            })
            
        except Exception as e:
            logger.error(f"Error renaming LoRA: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)

    async def get_trigger_words(self, request: web.Request) -> web.Response:
        """Get trigger words for specified LoRA models"""
        try:
            json_data = await request.json()
            lora_names = json_data.get("lora_names", [])
            node_ids = json_data.get("node_ids", [])
            
            all_trigger_words = []
            for lora_name in lora_names:
                _, trigger_words = await get_lora_info(lora_name)
                all_trigger_words.extend(trigger_words)
            
            # Format the trigger words
            trigger_words_text = ",, ".join(all_trigger_words) if all_trigger_words else ""
            
            # Send update to all connected trigger word toggle nodes
            for node_id in node_ids:
                PromptServer.instance.send_sync("trigger_word_update", {
                    "id": node_id,
                    "message": trigger_words_text
                })
            
            return web.json_response({"success": True})

        except Exception as e:
            logger.error(f"Error getting trigger words: {e}")
            return web.json_response({
                "success": False,
                "error": str(e)
            }, status=500)
