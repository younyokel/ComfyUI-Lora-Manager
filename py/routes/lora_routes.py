import jinja2
import asyncio
import logging
import os
from aiohttp import web
from typing import Dict
from server import PromptServer  # type: ignore

from .base_model_routes import BaseModelRoutes
from ..services.lora_service import LoraService
from ..services.service_registry import ServiceRegistry
from ..services.settings_manager import settings
from ..config import config
from ..utils.routes_common import ModelRouteUtils
from ..utils.utils import get_lora_info

logger = logging.getLogger(__name__)

class LoraRoutes(BaseModelRoutes):
    """LoRA-specific route controller"""
    
    def __init__(self):
        """Initialize LoRA routes with LoRA service"""
        # Service will be initialized later via setup_routes
        self.service = None
        self.civitai_client = None
        self.download_manager = None
        self._download_lock = asyncio.Lock()
        self.template_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(config.templates_path),
            autoescape=True
        )
    
    async def initialize_services(self):
        """Initialize services from ServiceRegistry"""
        lora_scanner = await ServiceRegistry.get_lora_scanner()
        self.service = LoraService(lora_scanner)
        self.civitai_client = await ServiceRegistry.get_civitai_client()
        self.download_manager = await ServiceRegistry.get_download_manager()
        
        # Initialize parent with the service
        super().__init__(self.service)
    
    def setup_routes(self, app: web.Application):
        """Setup LoRA routes"""
        # Schedule service initialization on app startup
        app.on_startup.append(lambda _: self.initialize_services())
        
        # Setup common routes with 'loras' prefix
        super().setup_routes(app, 'loras')
    
    def setup_specific_routes(self, app: web.Application, prefix: str):
        """Setup LoRA-specific routes"""
        # Lora page route
        app.router.add_get('/loras', self.handle_loras_page)

        # LoRA-specific query routes
        app.router.add_get(f'/api/{prefix}/letter-counts', self.get_letter_counts)
        app.router.add_get(f'/api/{prefix}/get-notes', self.get_lora_notes)
        app.router.add_get(f'/api/{prefix}/get-trigger-words', self.get_lora_trigger_words)
        app.router.add_get(f'/api/lora-preview-url', self.get_lora_preview_url)
        app.router.add_get(f'/api/lora-civitai-url', self.get_lora_civitai_url)
        app.router.add_get(f'/api/lora-model-description', self.get_lora_model_description)
        app.router.add_get(f'/api/folders', self.get_folders)
        app.router.add_get(f'/api/lora-roots', self.get_lora_roots)
        
        # LoRA-specific management routes
        app.router.add_post(f'/api/move_model', self.move_model)
        app.router.add_post(f'/api/move_models_bulk', self.move_models_bulk)
        
        # CivitAI integration with LoRA-specific validation
        app.router.add_get(f'/api/civitai/versions/{{model_id}}', self.get_civitai_versions_lora)
        app.router.add_get(f'/api/civitai/model/version/{{modelVersionId}}', self.get_civitai_model_by_version)
        app.router.add_get(f'/api/civitai/model/hash/{{hash}}', self.get_civitai_model_by_hash)
        
        # Download management
        app.router.add_post(f'/api/download-model', self.download_model)
        app.router.add_get(f'/api/download-model-get', self.download_model_get)
        app.router.add_get(f'/api/cancel-download-get', self.cancel_download_get)
        app.router.add_get(f'/api/download-progress/{{download_id}}', self.get_download_progress)
        
        # ComfyUI integration
        app.router.add_post(f'/loramanager/get_trigger_words', self.get_trigger_words)
        
        # Legacy API compatibility
        app.router.add_post(f'/api/delete_model', self.delete_model)
        app.router.add_post(f'/api/fetch-civitai', self.fetch_civitai)
        app.router.add_post(f'/api/relink-civitai', self.relink_civitai)
        app.router.add_post(f'/api/replace_preview', self.replace_preview)
        app.router.add_post(f'/api/fetch-all-civitai', self.fetch_all_civitai)
    
    def _parse_specific_params(self, request: web.Request) -> Dict:
        """Parse LoRA-specific parameters"""
        params = {}
        
        # LoRA-specific parameters
        if 'first_letter' in request.query:
            params['first_letter'] = request.query.get('first_letter')
        
        # Handle fuzzy search parameter name variation
        if request.query.get('fuzzy') == 'true':
            params['fuzzy_search'] = True
        
        # Handle additional filter parameters for LoRAs
        if 'lora_hash' in request.query:
            if not params.get('hash_filters'):
                params['hash_filters'] = {}
            params['hash_filters']['single_hash'] = request.query['lora_hash'].lower()
        elif 'lora_hashes' in request.query:
            if not params.get('hash_filters'):
                params['hash_filters'] = {}
            params['hash_filters']['multiple_hashes'] = [h.lower() for h in request.query['lora_hashes'].split(',')]
        
        return params
    
    async def handle_loras_page(self, request: web.Request) -> web.Response:
        """Handle GET /loras request"""
        try:
            # Check if the LoraScanner is initializing
            # It's initializing if the cache object doesn't exist yet,
            # OR if the scanner explicitly says it's initializing (background task running).
            is_initializing = (
                self.service.scanner._cache is None or self.service.scanner.is_initializing()
            )

            if is_initializing:
                # If still initializing, return loading page
                template = self.template_env.get_template('loras.html')
                rendered = template.render(
                    folders=[],
                    is_initializing=True,
                    settings=settings,
                    request=request
                )
                
                logger.info("Loras page is initializing, returning loading page")
            else:
                # Normal flow - get data from initialized cache
                try:
                    cache = await self.service.scanner.get_cached_data(force_refresh=False)
                    template = self.template_env.get_template('loras.html')
                    rendered = template.render(
                        folders=cache.folders,
                        is_initializing=False,
                        settings=settings,
                        request=request
                    )
                except Exception as cache_error:
                    logger.error(f"Error loading cache data: {cache_error}")
                    template = self.template_env.get_template('loras.html')
                    rendered = template.render(
                        folders=[],
                        is_initializing=True,
                        settings=settings,
                        request=request
                    )
                    logger.info("Cache error, returning initialization page")
            
            return web.Response(
                text=rendered,
                content_type='text/html'
            )
            
        except Exception as e:
            logger.error(f"Error handling loras request: {e}", exc_info=True)
            return web.Response(
                text="Error loading loras page",
                status=500
            )
    
    # LoRA-specific route handlers
    async def get_letter_counts(self, request: web.Request) -> web.Response:
        """Get count of LoRAs for each letter of the alphabet"""
        try:
            letter_counts = await self.service.get_letter_counts()
            return web.json_response({
                'success': True,
                'letter_counts': letter_counts
            })
        except Exception as e:
            logger.error(f"Error getting letter counts: {e}")
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)
    
    async def get_lora_notes(self, request: web.Request) -> web.Response:
        """Get notes for a specific LoRA file"""
        try:
            lora_name = request.query.get('name')
            if not lora_name:
                return web.Response(text='Lora file name is required', status=400)
            
            notes = await self.service.get_lora_notes(lora_name)
            if notes is not None:
                return web.json_response({
                    'success': True,
                    'notes': notes
                })
            else:
                return web.json_response({
                    'success': False,
                    'error': 'LoRA not found in cache'
                }, status=404)
                
        except Exception as e:
            logger.error(f"Error getting lora notes: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)
    
    async def get_lora_trigger_words(self, request: web.Request) -> web.Response:
        """Get trigger words for a specific LoRA file"""
        try:
            lora_name = request.query.get('name')
            if not lora_name:
                return web.Response(text='Lora file name is required', status=400)
            
            trigger_words = await self.service.get_lora_trigger_words(lora_name)
            return web.json_response({
                'success': True,
                'trigger_words': trigger_words
            })
            
        except Exception as e:
            logger.error(f"Error getting lora trigger words: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)
    
    async def get_lora_preview_url(self, request: web.Request) -> web.Response:
        """Get the static preview URL for a LoRA file"""
        try:
            lora_name = request.query.get('name')
            if not lora_name:
                return web.Response(text='Lora file name is required', status=400)
            
            preview_url = await self.service.get_lora_preview_url(lora_name)
            if preview_url:
                return web.json_response({
                    'success': True,
                    'preview_url': preview_url
                })
            else:
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
            lora_name = request.query.get('name')
            if not lora_name:
                return web.Response(text='Lora file name is required', status=400)
            
            result = await self.service.get_lora_civitai_url(lora_name)
            if result['civitai_url']:
                return web.json_response({
                    'success': True,
                    **result
                })
            else:
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
    
    async def get_folders(self, request: web.Request) -> web.Response:
        """Get all folders in the cache"""
        try:
            cache = await self.service.scanner.get_cached_data()
            return web.json_response({
                'folders': cache.folders
            })
        except Exception as e:
            logger.error(f"Error getting folders: {e}")
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)
    
    async def get_lora_roots(self, request: web.Request) -> web.Response:
        """Get all configured LoRA root directories"""
        try:
            return web.json_response({
                'roots': self.service.get_model_roots()
            })
        except Exception as e:
            logger.error(f"Error getting LoRA roots: {e}")
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)
    
    # Override get_models to add LoRA-specific response data
    async def get_models(self, request: web.Request) -> web.Response:
        """Get paginated LoRA data with LoRA-specific fields"""
        try:
            # Parse common query parameters
            params = self._parse_common_params(request)
            
            # Get data from service
            result = await self.service.get_paginated_data(**params)
            
            # Get all available folders from cache for LoRA-specific response
            cache = await self.service.scanner.get_cached_data()
            
            # Format response items with LoRA-specific structure
            formatted_result = {
                'items': [await self.service.format_response(item) for item in result['items']],
                'folders': cache.folders,  # LoRA-specific: include folders in response
                'total': result['total'],
                'page': result['page'],
                'page_size': result['page_size'],
                'total_pages': result['total_pages']
            }
            
            return web.json_response(formatted_result)
            
        except Exception as e:
            logger.error(f"Error in get_loras: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)
    
    # CivitAI integration methods
    async def get_civitai_versions_lora(self, request: web.Request) -> web.Response:
        """Get available versions for a Civitai LoRA model with local availability info"""
        try:
            model_id = request.match_info['model_id']
            response = await self.civitai_client.get_model_versions(model_id)
            if not response or not response.get('modelVersions'):
                return web.Response(status=404, text="Model not found")
            
            versions = response.get('modelVersions', [])
            model_type = response.get('type', '')
            
            # Check model type - should be LORA, LoCon, or DORA
            from ..utils.constants import VALID_LORA_TYPES
            if model_type.lower() not in VALID_LORA_TYPES:
                return web.json_response({
                    'error': f"Model type mismatch. Expected LORA or LoCon, got {model_type}"
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
                        version['existsLocally'] = self.service.has_hash(sha256)
                        if version['existsLocally']:
                            version['localPath'] = self.service.get_path_by_hash(sha256)
                        
                        # Also set the model file size at the version level for easier access
                        version['modelSizeKB'] = model_file.get('sizeKB')
                else:
                    # No model file found in this version
                    version['existsLocally'] = False
                    
            return web.json_response(versions)
        except Exception as e:
            logger.error(f"Error fetching LoRA model versions: {e}")
            return web.Response(status=500, text=str(e))
    
    async def get_civitai_model_by_version(self, request: web.Request) -> web.Response:
        """Get CivitAI model details by model version ID"""
        try:
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
            hash = request.match_info.get('hash')
            model = await self.civitai_client.get_model_by_hash(hash)
            return web.json_response(model)
        except Exception as e:
            logger.error(f"Error fetching model details by hash: {e}")
            return web.json_response({
                "success": False,
                "error": str(e)
            }, status=500)
    
    # Download management methods
    async def download_model(self, request: web.Request) -> web.Response:
        """Handle model download request"""
        return await ModelRouteUtils.handle_download_model(request, self.download_manager)
    
    async def download_model_get(self, request: web.Request) -> web.Response:
        """Handle model download request via GET method"""
        try:
            # Extract query parameters
            model_id = request.query.get('model_id')
            if not model_id:
                return web.Response(
                    status=400, 
                    text="Missing required parameter: Please provide 'model_id'"
                )
            
            # Get optional parameters
            model_version_id = request.query.get('model_version_id')
            download_id = request.query.get('download_id')
            use_default_paths = request.query.get('use_default_paths', 'false').lower() == 'true'
            
            # Create a data dictionary that mimics what would be received from a POST request
            data = {
                'model_id': model_id
            }
            
            # Add optional parameters only if they are provided
            if model_version_id:
                data['model_version_id'] = model_version_id
                
            if download_id:
                data['download_id'] = download_id
                
            data['use_default_paths'] = use_default_paths
            
            # Create a mock request object with the data
            future = asyncio.get_event_loop().create_future()
            future.set_result(data)
            
            mock_request = type('MockRequest', (), {
                'json': lambda self=None: future
            })()
            
            # Call the existing download handler
            return await ModelRouteUtils.handle_download_model(mock_request, self.download_manager)
            
        except Exception as e:
            error_message = str(e)
            logger.error(f"Error downloading model via GET: {error_message}", exc_info=True)
            return web.Response(status=500, text=error_message)
    
    async def cancel_download_get(self, request: web.Request) -> web.Response:
        """Handle GET request for cancelling a download by download_id"""
        try:
            download_id = request.query.get('download_id')
            if not download_id:
                return web.json_response({
                    'success': False,
                    'error': 'Download ID is required'
                }, status=400)
            
            # Create a mock request with match_info for compatibility
            mock_request = type('MockRequest', (), {
                'match_info': {'download_id': download_id}
            })()
            return await ModelRouteUtils.handle_cancel_download(mock_request, self.download_manager)
        except Exception as e:
            logger.error(f"Error cancelling download via GET: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)
    
    async def get_download_progress(self, request: web.Request) -> web.Response:
        """Handle request for download progress by download_id"""
        try:
            # Get download_id from URL path
            download_id = request.match_info.get('download_id')
            if not download_id:
                return web.json_response({
                    'success': False,
                    'error': 'Download ID is required'
                }, status=400)
            
            # Get progress information from websocket manager
            from ..services.websocket_manager import ws_manager
            progress_data = ws_manager.get_download_progress(download_id)
            
            if progress_data is None:
                return web.json_response({
                    'success': False,
                    'error': 'Download ID not found'
                }, status=404)
            
            return web.json_response({
                'success': True,
                'progress': progress_data.get('progress', 0)
            })
        except Exception as e:
            logger.error(f"Error getting download progress: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)
    
    # Model management methods
    async def move_model(self, request: web.Request) -> web.Response:
        """Handle model move request"""
        try:
            data = await request.json()
            file_path = data.get('file_path')  # full path of the model file
            target_path = data.get('target_path')  # folder path to move the model to
            
            if not file_path or not target_path:
                return web.Response(text='File path and target path are required', status=400)

            # Check if source and destination are the same
            import os
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
            success = await self.service.scanner.move_model(file_path, target_path)
            
            if success:
                return web.json_response({'success': True})
            else:
                return web.Response(text='Failed to move model', status=500)
                
        except Exception as e:
            logger.error(f"Error moving model: {e}", exc_info=True)
            return web.Response(text=str(e), status=500)
    
    async def move_models_bulk(self, request: web.Request) -> web.Response:
        """Handle bulk model move request"""
        try:
            data = await request.json()
            file_paths = data.get('file_paths', [])  # list of full paths of the model files
            target_path = data.get('target_path')  # folder path to move the models to
            
            if not file_paths or not target_path:
                return web.Response(text='File paths and target path are required', status=400)

            results = []
            import os
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
                success = await self.service.scanner.move_model(file_path, target_path)
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
            creator = {}
            if file_path:
                import os
                from ..utils.metadata_manager import MetadataManager
                metadata_path = os.path.splitext(file_path)[0] + '.metadata.json'
                metadata = await ModelRouteUtils.load_local_metadata(metadata_path)
                description = metadata.get('modelDescription')
                tags = metadata.get('tags', [])
                creator = metadata.get('creator', {})
            
            # If description is not in metadata, fetch from CivitAI
            if not description:
                logger.info(f"Fetching model metadata for model ID: {model_id}")
                model_metadata, _ = await self.civitai_client.get_model_metadata(model_id)
                
                if model_metadata:
                    description = model_metadata.get('description')
                    tags = model_metadata.get('tags', [])
                    creator = model_metadata.get('creator', {})
                
                    # Save the metadata to file if we have a file path and got metadata
                    if file_path:
                        try:
                            metadata_path = os.path.splitext(file_path)[0] + '.metadata.json'
                            metadata = await ModelRouteUtils.load_local_metadata(metadata_path)
                            
                            metadata['modelDescription'] = description
                            metadata['tags'] = tags
                            # Ensure the civitai dict exists
                            if 'civitai' not in metadata:
                                metadata['civitai'] = {}
                            # Store creator in the civitai nested structure
                            metadata['civitai']['creator'] = creator
                            
                            await MetadataManager.save_metadata(file_path, metadata, True)
                        except Exception as e:
                            logger.error(f"Error saving model metadata: {e}")
            
            return web.json_response({
                'success': True,
                'description': description or "<p>No model description available.</p>",
                'tags': tags,
                'creator': creator
            })
            
        except Exception as e:
            logger.error(f"Error getting model metadata: {e}")
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
                _, trigger_words = get_lora_info(lora_name)
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
