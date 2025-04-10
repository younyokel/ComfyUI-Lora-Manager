import os
import json
import asyncio
import aiohttp
from aiohttp import web
import logging
from datetime import datetime

from ..services.checkpoint_scanner import CheckpointScanner
from ..config import config

logger = logging.getLogger(__name__)

class CheckpointsRoutes:
    """API routes for checkpoint management"""
    
    def __init__(self):
        self.scanner = CheckpointScanner()
        
    def setup_routes(self, app):
        """Register routes with the aiohttp app"""
        app.router.add_get('/lora_manager/api/checkpoints', self.get_checkpoints)
        app.router.add_get('/lora_manager/api/checkpoints/scan', self.scan_checkpoints)
        app.router.add_get('/lora_manager/api/checkpoints/info/{name}', self.get_checkpoint_info)

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
            
            # Return as JSON
            return web.json_response(result)
            
        except Exception as e:
            logger.error(f"Error in get_checkpoints: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def get_paginated_data(self, page, page_size, sort_by='name', 
                               folder=None, search=None, fuzzy_search=False,
                               base_models=None, tags=None,
                               search_options=None, hash_filters=None):
        """Get paginated and filtered checkpoint data"""
        cache = await self.scanner.get_cached_data()

        # Implement similar filtering logic as in LoraScanner
        # (Adapt code from LoraScanner.get_paginated_data)
        # ...
        
        # For now, a simplified implementation:
        filtered_data = cache.sorted_by_date if sort_by == 'date' else cache.sorted_by_name
        
        # Apply basic folder filtering if needed
        if folder is not None:
            filtered_data = [
                cp for cp in filtered_data
                if cp['folder'] == folder
            ]
        
        # Apply basic search if needed
        if search:
            filtered_data = [
                cp for cp in filtered_data
                if search.lower() in cp['file_name'].lower() or 
                search.lower() in cp['model_name'].lower()
            ]
        
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
