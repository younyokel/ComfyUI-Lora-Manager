import os
import json
import asyncio
from typing import Dict
import aiohttp
import jinja2
from aiohttp import web
import logging
from datetime import datetime

from ..utils.model_utils import determine_base_model

from ..utils.constants import NSFW_LEVELS
from ..services.civitai_client import CivitaiClient
from ..services.websocket_manager import ws_manager
from ..services.checkpoint_scanner import CheckpointScanner
from ..config import config
from ..services.settings_manager import settings
from ..utils.utils import fuzzy_match

logger = logging.getLogger(__name__)

class CheckpointsRoutes:
    """API routes for checkpoint management"""
    
    def __init__(self):
        self.scanner = CheckpointScanner()
        self.template_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(config.templates_path),
            autoescape=True
        )
        
    def setup_routes(self, app):
        """Register routes with the aiohttp app"""
        app.router.add_get('/checkpoints', self.handle_checkpoints_page)
        app.router.add_get('/api/checkpoints', self.get_checkpoints)
        app.router.add_post('/api/checkpoints/fetch-all-civitai', self.fetch_all_civitai)
        app.router.add_get('/api/checkpoints/base-models', self.get_base_models)
        app.router.add_get('/api/checkpoints/top-tags', self.get_top_tags)
        app.router.add_get('/api/checkpoints/scan', self.scan_checkpoints)
        app.router.add_get('/api/checkpoints/info/{name}', self.get_checkpoint_info)

    async def get_checkpoints(self, request):
        """Get paginated checkpoint data"""
        try:
            # Parse query parameters
            page = int(request.query.get('page', '1'))
            page_size = min(int(request.query.get('page_size', '20')), 100)
            sort_by = request.query.get('sort', 'name')
            folder = request.query.get('folder', None)
            search = request.query.get('search', None)
            fuzzy_search = request.query.get('fuzzy_search', 'false').lower() == 'true'
            base_models = request.query.getall('base_model', [])
            tags = request.query.getall('tag', [])
            
            # Process search options
            search_options = {
                'filename': request.query.get('search_filename', 'true').lower() == 'true',
                'modelname': request.query.get('search_modelname', 'true').lower() == 'true',
                'tags': request.query.get('search_tags', 'false').lower() == 'true',
                'recursive': request.query.get('recursive', 'false').lower() == 'true',
            }
            
            # Process hash filters if provided
            hash_filters = {}
            if 'hash' in request.query:
                hash_filters['single_hash'] = request.query['hash']
            elif 'hashes' in request.query:
                try:
                    hash_list = json.loads(request.query['hashes'])
                    if isinstance(hash_list, list):
                        hash_filters['multiple_hashes'] = hash_list
                except (json.JSONDecodeError, TypeError):
                    pass
            
            # Get data from scanner
            result = await self.get_paginated_data(
                page=page,
                page_size=page_size,
                sort_by=sort_by,
                folder=folder,
                search=search,
                fuzzy_search=fuzzy_search,
                base_models=base_models,
                tags=tags,
                search_options=search_options,
                hash_filters=hash_filters
            )
            
            # Format response items
            formatted_result = {
                'items': [self._format_checkpoint_response(cp) for cp in result['items']],
                'total': result['total'],
                'page': result['page'],
                'page_size': result['page_size'],
                'total_pages': result['total_pages']
            }
            
            # Return as JSON
            return web.json_response(formatted_result)
            
        except Exception as e:
            logger.error(f"Error in get_checkpoints: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def get_paginated_data(self, page, page_size, sort_by='name', 
                               folder=None, search=None, fuzzy_search=False,
                               base_models=None, tags=None,
                               search_options=None, hash_filters=None):
        """Get paginated and filtered checkpoint data"""
        cache = await self.scanner.get_cached_data()

        # Get default search options if not provided
        if search_options is None:
            search_options = {
                'filename': True,
                'modelname': True,
                'tags': False,
                'recursive': False,
            }

        # Get the base data set
        filtered_data = cache.sorted_by_date if sort_by == 'date' else cache.sorted_by_name
        
        # Apply hash filtering if provided (highest priority)
        if hash_filters:
            single_hash = hash_filters.get('single_hash')
            multiple_hashes = hash_filters.get('multiple_hashes')
            
            if single_hash:
                # Filter by single hash
                single_hash = single_hash.lower()  # Ensure lowercase for matching
                filtered_data = [
                    cp for cp in filtered_data
                    if cp.get('sha256', '').lower() == single_hash
                ]
            elif multiple_hashes:
                # Filter by multiple hashes
                hash_set = set(hash.lower() for hash in multiple_hashes)  # Convert to set for faster lookup
                filtered_data = [
                    cp for cp in filtered_data
                    if cp.get('sha256', '').lower() in hash_set
                ]
            
            # Jump to pagination
            total_items = len(filtered_data)
            start_idx = (page - 1) * page_size
            end_idx = min(start_idx + page_size, total_items)
            
            result = {
                'items': filtered_data[start_idx:end_idx],
                'total': total_items,
                'page': page,
                'page_size': page_size,
                'total_pages': (total_items + page_size - 1) // page_size
            }
            
            return result
        
        # Apply SFW filtering if enabled in settings
        if settings.get('show_only_sfw', False):
            filtered_data = [
                cp for cp in filtered_data
                if not cp.get('preview_nsfw_level') or cp.get('preview_nsfw_level') < NSFW_LEVELS['R']
            ]
        
        # Apply folder filtering
        if folder is not None:
            if search_options.get('recursive', False):
                # Recursive folder filtering - include all subfolders
                filtered_data = [
                    cp for cp in filtered_data
                    if cp['folder'].startswith(folder)
                ]
            else:
                # Exact folder filtering
                filtered_data = [
                    cp for cp in filtered_data
                    if cp['folder'] == folder
                ]
        
        # Apply base model filtering
        if base_models and len(base_models) > 0:
            filtered_data = [
                cp for cp in filtered_data
                if cp.get('base_model') in base_models
            ]
        
        # Apply tag filtering
        if tags and len(tags) > 0:
            filtered_data = [
                cp for cp in filtered_data
                if any(tag in cp.get('tags', []) for tag in tags)
            ]
        
        # Apply search filtering
        if search:
            search_results = []
            
            for cp in filtered_data:
                # Search by file name
                if search_options.get('filename', True):
                    if fuzzy_search:
                        if fuzzy_match(cp.get('file_name', ''), search):
                            search_results.append(cp)
                            continue
                    elif search.lower() in cp.get('file_name', '').lower():
                        search_results.append(cp)
                        continue
                
                # Search by model name
                if search_options.get('modelname', True):
                    if fuzzy_search:
                        if fuzzy_match(cp.get('model_name', ''), search):
                            search_results.append(cp)
                            continue
                    elif search.lower() in cp.get('model_name', '').lower():
                        search_results.append(cp)
                        continue
                
                # Search by tags
                if search_options.get('tags', False) and 'tags' in cp:
                    if any((fuzzy_match(tag, search) if fuzzy_search else search.lower() in tag.lower()) for tag in cp['tags']):
                        search_results.append(cp)
                        continue
            
            filtered_data = search_results

        # Calculate pagination
        total_items = len(filtered_data)
        start_idx = (page - 1) * page_size
        end_idx = min(start_idx + page_size, total_items)
        
        result = {
            'items': filtered_data[start_idx:end_idx],
            'total': total_items,
            'page': page,
            'page_size': page_size,
            'total_pages': (total_items + page_size - 1) // page_size
        }
        
        return result

    def _format_checkpoint_response(self, checkpoint):
        """Format checkpoint data for API response"""
        return {
            "model_name": checkpoint["model_name"],
            "file_name": checkpoint["file_name"],
            "preview_url": config.get_preview_static_url(checkpoint.get("preview_url", "")),
            "preview_nsfw_level": checkpoint.get("preview_nsfw_level", 0),
            "base_model": checkpoint.get("base_model", ""),
            "folder": checkpoint["folder"],
            "sha256": checkpoint.get("sha256", ""),
            "file_path": checkpoint["file_path"].replace(os.sep, "/"),
            "file_size": checkpoint.get("size", 0),
            "modified": checkpoint.get("modified", ""),
            "tags": checkpoint.get("tags", []),
            "modelDescription": checkpoint.get("modelDescription", ""),
            "from_civitai": checkpoint.get("from_civitai", True),
            "notes": checkpoint.get("notes", ""),
            "model_type": checkpoint.get("model_type", "checkpoint"),
            "civitai": self._filter_civitai_data(checkpoint.get("civitai", {}))
        }
    
    def _filter_civitai_data(self, data):
        """Filter relevant fields from CivitAI data"""
        if not data:
            return {}
            
        fields = [
            "id", "modelId", "name", "createdAt", "updatedAt", 
            "publishedAt", "trainedWords", "baseModel", "description",
            "model", "images"
        ]
        return {k: data[k] for k in fields if k in data}
    
    async def fetch_all_civitai(self, request: web.Request) -> web.Response:
        """Fetch CivitAI metadata for all checkpoints in the background"""
        try:
            cache = await self.scanner.get_cached_data()
            total = len(cache.raw_data)
            processed = 0
            success = 0
            needs_resort = False
            
            # Prepare checkpoints to process
            to_process = [
                cp for cp in cache.raw_data 
                if cp.get('sha256') and (not cp.get('civitai') or 'id' not in cp.get('civitai')) and cp.get('from_civitai', True)
            ]
            total_to_process = len(to_process)
            
            # Send initial progress
            await ws_manager.broadcast({
                'status': 'started',
                'total': total_to_process,
                'processed': 0,
                'success': 0
            })
            
            # Process each checkpoint
            for cp in to_process:
                try:
                    original_name = cp.get('model_name')
                    if await self._fetch_and_update_single_checkpoint(
                        sha256=cp['sha256'],
                        file_path=cp['file_path'],
                        checkpoint=cp
                    ):
                        success += 1
                        if original_name != cp.get('model_name'):
                            needs_resort = True
                    
                    processed += 1
                    
                    # Send progress update
                    await ws_manager.broadcast({
                        'status': 'processing',
                        'total': total_to_process,
                        'processed': processed,
                        'success': success,
                        'current_name': cp.get('model_name', 'Unknown')
                    })
                    
                except Exception as e:
                    logger.error(f"Error fetching CivitAI data for {cp['file_path']}: {e}")
            
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
                "message": f"Successfully updated {success} of {processed} processed checkpoints (total: {total})"
            })
            
        except Exception as e:
            # Send error message
            await ws_manager.broadcast({
                'status': 'error',
                'error': str(e)
            })
            logger.error(f"Error in fetch_all_civitai for checkpoints: {e}")
            return web.Response(text=str(e), status=500)
        
    async def _fetch_and_update_single_checkpoint(self, sha256: str, file_path: str, checkpoint: dict) -> bool:
        """Fetch and update metadata for a single checkpoint without sorting"""
        client = CivitaiClient()
        try:
            metadata_path = os.path.splitext(file_path)[0] + '.metadata.json'
            
            # Load local metadata
            local_metadata = self._load_local_metadata(metadata_path)

            # Fetch metadata from Civitai
            civitai_metadata = await client.get_model_by_hash(sha256)
            if not civitai_metadata:
                # Mark as not from CivitAI if not found
                local_metadata['from_civitai'] = False
                checkpoint['from_civitai'] = False
                with open(metadata_path, 'w', encoding='utf-8') as f:
                    json.dump(local_metadata, f, indent=2, ensure_ascii=False)
                return False

            # Update metadata with Civitai data
            await self._update_model_metadata(
                metadata_path, 
                local_metadata, 
                civitai_metadata, 
                client
            )
            
            # Update cache object directly
            checkpoint.update({
                'model_name': local_metadata.get('model_name'),
                'preview_url': local_metadata.get('preview_url'),
                'from_civitai': True,
                'civitai': civitai_metadata
            })
                
            return True

        except Exception as e:
            logger.error(f"Error fetching CivitAI data for checkpoint: {e}")
            return False
        finally:
            await client.close()

    def _load_local_metadata(self, metadata_path: str) -> Dict:
        """Load local metadata file"""
        if os.path.exists(metadata_path):
            try:
                with open(metadata_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Error loading metadata from {metadata_path}: {e}")
        return {}
    
    async def _update_model_metadata(self, metadata_path: str, local_metadata: Dict, 
                                   civitai_metadata: Dict, client: CivitaiClient) -> None:
        """Update local metadata with CivitAI data"""
        local_metadata['civitai'] = civitai_metadata
        
        # Update model name if available
        if 'model' in civitai_metadata:
            if civitai_metadata.get('model', {}).get('name'):
                local_metadata['model_name'] = civitai_metadata['model']['name']
        
            # Fetch additional model metadata (description and tags) if we have model ID
            model_id = civitai_metadata['modelId']
            if model_id:
                model_metadata, _ = await client.get_model_metadata(str(model_id))
                if model_metadata:
                    local_metadata['modelDescription'] = model_metadata.get('description', '')
                    local_metadata['tags'] = model_metadata.get('tags', [])
        
        # Update base model
        local_metadata['base_model'] = determine_base_model(civitai_metadata.get('baseModel'))
        
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
                    local_metadata['preview_nsfw_level'] = first_preview.get('nsfwLevel', 0)

        # Save updated metadata
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(local_metadata, f, indent=2, ensure_ascii=False)

        await self.scanner.update_single_model_cache(local_metadata['file_path'], local_metadata['file_path'], local_metadata)
    
    async def get_top_tags(self, request: web.Request) -> web.Response:
        """Handle request for top tags sorted by frequency"""
        try:
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

    async def scan_checkpoints(self, request):
        """Force a rescan of checkpoint files"""
        try:
            await self.scanner.get_cached_data(force_refresh=True)
            return web.json_response({"status": "success", "message": "Checkpoint scan completed"})
        except Exception as e:
            logger.error(f"Error in scan_checkpoints: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def get_checkpoint_info(self, request):
        """Get detailed information for a specific checkpoint by name"""
        try:
            name = request.match_info.get('name', '')
            checkpoint_info = await self.scanner.get_checkpoint_info_by_name(name)
            
            if checkpoint_info:
                return web.json_response(checkpoint_info)
            else:
                return web.json_response({"error": "Checkpoint not found"}, status=404)
                
        except Exception as e:
            logger.error(f"Error in get_checkpoint_info: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def handle_checkpoints_page(self, request: web.Request) -> web.Response:
        """Handle GET /checkpoints request"""
        try:
            # 检查缓存初始化状态，根据initialize_in_background的工作方式调整判断逻辑
            is_initializing = (
                self.scanner._cache is None or 
                len(self.scanner._cache.raw_data) == 0 or
                hasattr(self.scanner, '_is_initializing') and self.scanner._is_initializing
            )

            if is_initializing:
                # 如果正在初始化，返回一个只包含加载提示的页面
                template = self.template_env.get_template('checkpoints.html')
                rendered = template.render(
                    folders=[],  # 空文件夹列表
                    is_initializing=True,  # 新增标志
                    settings=settings,  # Pass settings to template
                    request=request  # Pass the request object to the template
                )
                
                logger.info("Checkpoints page is initializing, returning loading page")
            else:
                # 正常流程 - 获取已经初始化好的缓存数据
                try:
                    cache = await self.scanner.get_cached_data(force_refresh=False)
                    template = self.template_env.get_template('checkpoints.html')
                    rendered = template.render(
                        folders=cache.folders,
                        is_initializing=False,
                        settings=settings,  # Pass settings to template
                        request=request  # Pass the request object to the template
                    )
                    logger.debug(f"Checkpoints page loaded successfully with {len(cache.raw_data)} items")
                except Exception as cache_error:
                    logger.error(f"Error loading checkpoints cache data: {cache_error}")
                    # 如果获取缓存失败，也显示初始化页面
                    template = self.template_env.get_template('checkpoints.html')
                    rendered = template.render(
                        folders=[],
                        is_initializing=True,
                        settings=settings,
                        request=request
                    )
                    logger.info("Checkpoints cache error, returning initialization page")
            
            return web.Response(
                text=rendered,
                content_type='text/html'
            )
        except Exception as e:
            logger.error(f"Error handling checkpoints request: {e}", exc_info=True)
            return web.Response(
                text="Error loading checkpoints page",
                status=500
            )
