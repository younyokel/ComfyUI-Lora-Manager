import os
import json
import logging
from aiohttp import web
from typing import Dict, List

from ..services.file_monitor import LoraFileMonitor
from ..services.download_manager import DownloadManager
from ..services.civitai_client import CivitaiClient
from ..config import config
from ..services.lora_scanner import LoraScanner
from operator import itemgetter
from ..services.websocket_manager import ws_manager
from ..services.settings_manager import settings
import asyncio
from .update_routes import UpdateRoutes
from ..services.recipe_scanner import RecipeScanner

logger = logging.getLogger(__name__)

class ApiRoutes:
    """API route handlers for LoRA management"""

    def __init__(self, file_monitor: LoraFileMonitor):
        self.scanner = LoraScanner()
        self.civitai_client = CivitaiClient()
        self.download_manager = DownloadManager(file_monitor)
        self._download_lock = asyncio.Lock()

    @classmethod
    def setup_routes(cls, app: web.Application, monitor: LoraFileMonitor):
        """Register API routes"""
        routes = cls(monitor)
        app.router.add_post('/api/delete_model', routes.delete_model)
        app.router.add_post('/api/fetch-civitai', routes.fetch_civitai)
        app.router.add_post('/api/replace_preview', routes.replace_preview)
        app.router.add_get('/api/loras', routes.get_loras)
        app.router.add_post('/api/fetch-all-civitai', routes.fetch_all_civitai)
        app.router.add_get('/ws/fetch-progress', ws_manager.handle_connection)
        app.router.add_get('/api/lora-roots', routes.get_lora_roots)
        app.router.add_get('/api/civitai/versions/{model_id}', routes.get_civitai_versions)
        app.router.add_post('/api/download-lora', routes.download_lora)
        app.router.add_post('/api/settings', routes.update_settings)
        app.router.add_post('/api/move_model', routes.move_model)
        app.router.add_post('/loras/api/save-metadata', routes.save_metadata)
        app.router.add_get('/api/lora-preview-url', routes.get_lora_preview_url)  # Add new route
        app.router.add_post('/api/move_models_bulk', routes.move_models_bulk)
        app.router.add_get('/api/recipes', cls.handle_get_recipes)

        # Add update check routes
        UpdateRoutes.setup_routes(app)

    async def delete_model(self, request: web.Request) -> web.Response:
        """Handle model deletion request"""
        try:
            data = await request.json()
            file_path = data.get('file_path')
            if not file_path:
                return web.Response(text='Model path is required', status=400)

            target_dir = os.path.dirname(file_path)
            file_name = os.path.splitext(os.path.basename(file_path))[0]
            
            deleted_files = await self._delete_model_files(target_dir, file_name)
            
            return web.json_response({
                'success': True,
                'deleted_files': deleted_files
            })
            
        except Exception as e:
            logger.error(f"Error deleting model: {e}", exc_info=True)
            return web.Response(text=str(e), status=500)

    async def fetch_civitai(self, request: web.Request) -> web.Response:
        """Handle CivitAI metadata fetch request"""
        try:
            data = await request.json()
            metadata_path = os.path.splitext(data['file_path'])[0] + '.metadata.json'
            
            # Check if model is from CivitAI
            local_metadata = await self._load_local_metadata(metadata_path)

            # Fetch and update metadata
            civitai_metadata = await self.civitai_client.get_model_by_hash(local_metadata["sha256"])
            if not civitai_metadata:
                return await self._handle_not_found_on_civitai(metadata_path, local_metadata)

            await self._update_model_metadata(metadata_path, local_metadata, civitai_metadata, self.civitai_client)
            
            return web.json_response({"success": True})

        except Exception as e:
            logger.error(f"Error fetching from CivitAI: {e}", exc_info=True)
            return web.json_response({"success": False, "error": str(e)}, status=500)

    async def replace_preview(self, request: web.Request) -> web.Response:
        """Handle preview image replacement request"""
        try:
            reader = await request.multipart()
            preview_data, content_type = await self._read_preview_file(reader)
            model_path = await self._read_model_path(reader)
            
            preview_path = await self._save_preview_file(model_path, preview_data, content_type)
            await self._update_preview_metadata(model_path, preview_path)
            
            # Update preview URL in scanner cache
            await self.scanner.update_preview_in_cache(model_path, preview_path)
            
            return web.json_response({
                "success": True,
                "preview_url": config.get_preview_static_url(preview_path)
            })
            
        except Exception as e:
            logger.error(f"Error replacing preview: {e}", exc_info=True)
            return web.Response(text=str(e), status=500)

    async def get_loras(self, request: web.Request) -> web.Response:
        """Handle paginated LoRA data request"""
        try:
            # Parse query parameters
            page = int(request.query.get('page', '1'))
            page_size = int(request.query.get('page_size', '20'))
            sort_by = request.query.get('sort_by', 'name')
            folder = request.query.get('folder')
            search = request.query.get('search', '').lower()
            fuzzy = request.query.get('fuzzy', 'false').lower() == 'true'
            recursive = request.query.get('recursive', 'false').lower() == 'true'
            
            # Parse base models filter parameter
            base_models = request.query.get('base_models', '').split(',')
            base_models = [model.strip() for model in base_models if model.strip()]
            
            # Validate parameters
            if page < 1 or page_size < 1 or page_size > 100:
                return web.json_response({
                    'error': 'Invalid pagination parameters'
                }, status=400)
            
            if sort_by not in ['date', 'name']:
                return web.json_response({
                    'error': 'Invalid sort parameter'
                }, status=400)
            
            # Get paginated data with search and filters
            result = await self.scanner.get_paginated_data(
                page=page,
                page_size=page_size,
                sort_by=sort_by,
                folder=folder,
                search=search,
                fuzzy=fuzzy,
                recursive=recursive,
                base_models=base_models  # Pass base models filter
            )
            
            # Format the response data
            formatted_items = [
                self._format_lora_response(item) 
                for item in result['items']
            ]

            # Get all available folders from cache
            cache = await self.scanner.get_cached_data()
            
            return web.json_response({
                'items': formatted_items,
                'total': result['total'],
                'page': result['page'],
                'page_size': result['page_size'],
                'total_pages': result['total_pages'],
                'folders': cache.folders
            })
            
        except Exception as e:
            logger.error(f"Error in get_loras: {str(e)}", exc_info=True)
            return web.json_response({
                'error': 'Internal server error'
            }, status=500)

    def _format_lora_response(self, lora: Dict) -> Dict:
        """Format LoRA data for API response"""
        return {
            "model_name": lora["model_name"],
            "file_name": lora["file_name"],
            "preview_url": config.get_preview_static_url(lora["preview_url"]),
            "base_model": lora["base_model"],
            "folder": lora["folder"],
            "sha256": lora["sha256"],
            "file_path": lora["file_path"].replace(os.sep, "/"),
            "file_size": lora["size"],
            "modified": lora["modified"],
            "from_civitai": lora.get("from_civitai", True),
            "usage_tips": lora.get("usage_tips", ""),
            "notes": lora.get("notes", ""),
            "civitai": self._filter_civitai_data(lora.get("civitai", {}))
        }

    def _filter_civitai_data(self, data: Dict) -> Dict:
        """Filter relevant fields from CivitAI data"""
        if not data:
            return {}
            
        fields = [
            "id", "modelId", "name", "createdAt", "updatedAt", 
            "publishedAt", "trainedWords", "baseModel", "description",
            "model", "images"
        ]
        return {k: data[k] for k in fields if k in data}

    # Private helper methods
    async def _delete_model_files(self, target_dir: str, file_name: str) -> List[str]:
        """Delete model and associated files"""
        patterns = [
            f"{file_name}.safetensors",  # Required
            f"{file_name}.metadata.json",
            f"{file_name}.preview.png",
            f"{file_name}.preview.jpg",
            f"{file_name}.preview.jpeg",
            f"{file_name}.preview.webp",
            f"{file_name}.preview.mp4",
            f"{file_name}.png",
            f"{file_name}.jpg",
            f"{file_name}.jpeg",
            f"{file_name}.webp",
            f"{file_name}.mp4"
        ]
        
        deleted = []
        main_file = patterns[0]
        main_path = os.path.join(target_dir, main_file).replace(os.sep, '/')
        
        if os.path.exists(main_path):
            # Notify file monitor to ignore delete event
            self.download_manager.file_monitor.handler.add_ignore_path(main_path, 0)
            
            # Delete file
            os.remove(main_path)
            deleted.append(main_path)
        else:
            logger.warning(f"Model file not found: {main_file}")

        # Remove from cache
        cache = await self.scanner.get_cached_data()
        cache.raw_data = [item for item in cache.raw_data if item['file_path'] != main_path]
        await cache.resort()
        
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
        # Determine file extension based on content type
        if content_type.startswith('video/'):
            extension = '.preview.mp4'
        else:
            extension = '.preview.png'
        
        base_name = os.path.splitext(os.path.basename(model_path))[0]
        folder = os.path.dirname(model_path)
        preview_path = os.path.join(folder, base_name + extension).replace(os.sep, '/')
        
        with open(preview_path, 'wb') as f:
            f.write(preview_data)
            
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

    async def _load_local_metadata(self, metadata_path: str) -> Dict:
        """Load local metadata file"""
        if os.path.exists(metadata_path):
            try:
                with open(metadata_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Error loading metadata from {metadata_path}: {e}")
        return {}

    async def _handle_not_found_on_civitai(self, metadata_path: str, local_metadata: Dict) -> web.Response:
        """Handle case when model is not found on CivitAI"""
        local_metadata['from_civitai'] = False
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(local_metadata, f, indent=2, ensure_ascii=False)
        return web.json_response(
            {"success": False, "error": "Not found on CivitAI"}, 
            status=404
        )

    async def _update_model_metadata(self, metadata_path: str, local_metadata: Dict, 
                                   civitai_metadata: Dict, client: CivitaiClient) -> None:
        """Update local metadata with CivitAI data"""
        local_metadata['civitai'] = civitai_metadata
        
        # Update model name if available
        if 'model' in civitai_metadata:
            local_metadata['model_name'] = civitai_metadata['model'].get('name', 
                                                                       local_metadata.get('model_name'))
        
        # Update base model
        local_metadata['base_model'] = civitai_metadata.get('baseModel')
        
        # Update preview if needed
        if not local_metadata.get('preview_url') or not os.path.exists(local_metadata['preview_url']):
            first_preview = next((img for img in civitai_metadata.get('images', [])), None)
            if first_preview:
                preview_ext = '.mp4' if first_preview['type'] == 'video' else os.path.splitext(first_preview['url'])[-1]
                base_name = os.path.splitext(os.path.splitext(os.path.basename(metadata_path))[0])[0]
                preview_filename = base_name + preview_ext
                preview_path = os.path.join(os.path.dirname(metadata_path), preview_filename)
                
                if await client.download_preview_image(first_preview['url'], preview_path):
                    local_metadata['preview_url'] = preview_path.replace(os.sep, '/')

        # Save updated metadata
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(local_metadata, f, indent=2, ensure_ascii=False)

        await self.scanner.update_single_lora_cache(local_metadata['file_path'], local_metadata['file_path'], local_metadata)

    async def fetch_all_civitai(self, request: web.Request) -> web.Response:
        """Fetch CivitAI metadata for all loras in the background"""
        try:
            cache = await self.scanner.get_cached_data()
            total = len(cache.raw_data)
            processed = 0
            success = 0
            needs_resort = False
            
            # 准备要处理的 loras
            to_process = [
                lora for lora in cache.raw_data 
                if lora.get('sha256') and not lora.get('civitai') and lora.get('from_civitai')
            ]
            total_to_process = len(to_process)
            
            # 发送初始进度
            await ws_manager.broadcast({
                'status': 'started',
                'total': total_to_process,
                'processed': 0,
                'success': 0
            })
            
            for lora in to_process:
                try:
                    original_name = lora.get('model_name')
                    if await self._fetch_and_update_single_lora(
                        sha256=lora['sha256'],
                        file_path=lora['file_path'],
                        lora=lora
                    ):
                        success += 1
                        if original_name != lora.get('model_name'):
                            needs_resort = True
                    
                    processed += 1
                    
                    # 每处理一个就发送进度更新
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
            
            # 发送完成消息
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
            # 发送错误消息
            await ws_manager.broadcast({
                'status': 'error',
                'error': str(e)
            })
            logger.error(f"Error in fetch_all_civitai: {e}")
            return web.Response(text=str(e), status=500)

    async def _fetch_and_update_single_lora(self, sha256: str, file_path: str, lora: dict) -> bool:
        """Fetch and update metadata for a single lora without sorting
        
        Args:
            sha256: SHA256 hash of the lora file
            file_path: Path to the lora file
            lora: The lora object in cache to update
            
        Returns:
            bool: True if successful, False otherwise
        """
        client = CivitaiClient()
        try:
            metadata_path = os.path.splitext(file_path)[0] + '.metadata.json'
            
            # Check if model is from CivitAI
            local_metadata = await self._load_local_metadata(metadata_path)

            # Fetch metadata
            civitai_metadata = await client.get_model_by_hash(sha256)
            if not civitai_metadata:
                # Mark as not from CivitAI if not found
                local_metadata['from_civitai'] = False
                lora['from_civitai'] = False
                with open(metadata_path, 'w', encoding='utf-8') as f:
                    json.dump(local_metadata, f, indent=2, ensure_ascii=False)
                return False

            # Update metadata
            await self._update_model_metadata(
                metadata_path, 
                local_metadata, 
                civitai_metadata, 
                client
            )
            
            # Update cache object directly
            lora.update({
                'model_name': local_metadata.get('model_name'),
                'preview_url': local_metadata.get('preview_url'),
                'from_civitai': True,
                'civitai': civitai_metadata
            })
                
            return True

        except Exception as e:
            logger.error(f"Error fetching CivitAI data: {e}")
            return False
        finally:
            await client.close()

    async def get_lora_roots(self, request: web.Request) -> web.Response:
        """Get all configured LoRA root directories"""
        return web.json_response({
            'roots': config.loras_roots
        })

    async def get_civitai_versions(self, request: web.Request) -> web.Response:
        """Get available versions for a Civitai model with local availability info"""
        try:
            model_id = request.match_info['model_id']
            versions = await self.civitai_client.get_model_versions(model_id)
            if not versions:
                return web.Response(status=404, text="Model not found")
            
            # Check local availability for each version
            for version in versions:
                for file in version.get('files', []):
                    sha256 = file.get('hashes', {}).get('SHA256')
                    if sha256:
                        file['existsLocally'] = self.scanner.has_lora_hash(sha256)
                        if file['existsLocally']:
                            file['localPath'] = self.scanner.get_lora_path_by_hash(sha256)
                        
            return web.json_response(versions)
        except Exception as e:
            logger.error(f"Error fetching model versions: {e}")
            return web.Response(status=500, text=str(e))

    async def download_lora(self, request: web.Request) -> web.Response:
        async with self._download_lock:
            try:
                data = await request.json()
                
                # Create progress callback
                async def progress_callback(progress):
                    await ws_manager.broadcast({
                        'status': 'progress',
                        'progress': progress
                    })
                
                result = await self.download_manager.download_from_civitai(
                    download_url=data.get('download_url'),
                    save_dir=data.get('lora_root'),
                    relative_path=data.get('relative_path'),
                    progress_callback=progress_callback  # Add progress callback
                )
                
                if not result.get('success', False):
                    return web.Response(status=500, text=result.get('error', 'Unknown error'))
                
                return web.json_response(result)
            except Exception as e:
                logger.error(f"Error downloading LoRA: {e}")
                return web.Response(status=500, text=str(e))

    async def update_settings(self, request: web.Request) -> web.Response:
        """Update application settings"""
        try:
            data = await request.json()
            
            # Validate and update settings
            if 'civitai_api_key' in data:
                settings.set('civitai_api_key', data['civitai_api_key'])
            
            return web.json_response({'success': True})
        except Exception as e:
            logger.error(f"Error updating settings: {e}", exc_info=True)  # 添加 exc_info=True 以获取完整堆栈
            return web.Response(status=500, text=str(e))

    async def move_model(self, request: web.Request) -> web.Response:
        """Handle model move request"""
        try:
            data = await request.json()
            file_path = data.get('file_path')
            target_path = data.get('target_path')
            
            if not file_path or not target_path:
                return web.Response(text='File path and target path are required', status=400)

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
        if hasattr(cls, '_instance'):
            await cls._instance.civitai_client.close()

    async def save_metadata(self, request: web.Request) -> web.Response:
        """Handle saving metadata updates"""
        try:
            data = await request.json()
            file_path = data.get('file_path')
            if not file_path:
                return web.Response(text='File path is required', status=400)

            # Remove file path from data to avoid saving it
            metadata_updates = {k: v for k, v in data.items() if k != 'file_path'}
            
            # Get metadata file path
            metadata_path = os.path.splitext(file_path)[0] + '.metadata.json'
            
            # Load existing metadata
            if os.path.exists(metadata_path):
                with open(metadata_path, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
            else:
                metadata = {}

            # Update metadata with new values
            metadata.update(metadata_updates)

            # Save updated metadata
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)

            # Update cache
            await self.scanner.update_single_lora_cache(file_path, file_path, metadata)

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
            return web.Response(text=str(e), status=500)

    async def move_models_bulk(self, request: web.Request) -> web.Response:
        """Handle bulk model move request"""
        try:
            data = await request.json()
            file_paths = data.get('file_paths', [])
            target_path = data.get('target_path')
            
            if not file_paths or not target_path:
                return web.Response(text='File paths and target path are required', status=400)

            results = []
            for file_path in file_paths:
                success = await self.scanner.move_model(file_path, target_path)
                results.append({"path": file_path, "success": success})
            
            # Count successes
            success_count = sum(1 for r in results if r["success"])
            
            if success_count == len(file_paths):
                return web.json_response({
                    'success': True,
                    'message': f'Successfully moved {success_count} models'
                })
            elif success_count > 0:
                return web.json_response({
                    'success': True,
                    'message': f'Moved {success_count} of {len(file_paths)} models',
                    'results': results
                })
            else:
                return web.Response(text='Failed to move any models', status=500)
                
        except Exception as e:
            logger.error(f"Error moving models in bulk: {e}", exc_info=True)
            return web.Response(text=str(e), status=500)

    @staticmethod
    async def handle_get_recipes(request):
        """API endpoint for getting paginated recipes"""
        try:
            # Get query parameters with defaults
            page = int(request.query.get('page', '1'))
            page_size = int(request.query.get('page_size', '20'))
            sort_by = request.query.get('sort_by', 'date')
            search = request.query.get('search', None)
            
            # Get scanner instance
            scanner = RecipeScanner(LoraScanner())
            
            # Get paginated data
            result = await scanner.get_paginated_data(
                page=page,
                page_size=page_size,
                sort_by=sort_by,
                search=search
            )
            
            return web.json_response(result)
        except Exception as e:
            logger.error(f"Error retrieving recipes: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)
