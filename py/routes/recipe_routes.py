import os
import logging
import sys
from aiohttp import web
from typing import Dict

from ..services.recipe_scanner import RecipeScanner
from ..services.lora_scanner import LoraScanner
from ..config import config

logger = logging.getLogger(__name__)
print("Recipe Routes module loaded", file=sys.stderr)

class RecipeRoutes:
    """API route handlers for Recipe management"""

    def __init__(self):
        print("Initializing RecipeRoutes", file=sys.stderr)
        self.recipe_scanner = RecipeScanner(LoraScanner())
        
        # Pre-warm the cache
        self._init_cache_task = None

    @classmethod
    def setup_routes(cls, app: web.Application):
        """Register API routes"""
        print("Setting up recipe routes", file=sys.stderr)
        routes = cls()
        app.router.add_get('/api/recipes', routes.get_recipes)
        app.router.add_get('/api/recipe/{recipe_id}', routes.get_recipe_detail)
        
        # Start cache initialization
        app.on_startup.append(routes._init_cache)
        
        print("Recipe routes setup complete", file=sys.stderr)
    
    async def _init_cache(self, app):
        """Initialize cache on startup"""
        print("Pre-warming recipe cache...", file=sys.stderr)
        try:
            # Diagnose lora scanner first
            await self.recipe_scanner._lora_scanner.diagnose_hash_index()
            
            # Force a cache refresh
            await self.recipe_scanner.get_cached_data(force_refresh=True)
            print("Recipe cache pre-warming complete", file=sys.stderr)
        except Exception as e:
            print(f"Error pre-warming recipe cache: {e}", file=sys.stderr)
    
    async def get_recipes(self, request: web.Request) -> web.Response:
        """API endpoint for getting paginated recipes"""
        try:
            print("API: GET /api/recipes", file=sys.stderr)
            # Get query parameters with defaults
            page = int(request.query.get('page', '1'))
            page_size = int(request.query.get('page_size', '20'))
            sort_by = request.query.get('sort_by', 'date')
            search = request.query.get('search', None)
            
            # Get paginated data
            result = await self.recipe_scanner.get_paginated_data(
                page=page,
                page_size=page_size,
                sort_by=sort_by,
                search=search
            )
            
            # Format the response data with static URLs for file paths
            for item in result['items']:
                item['preview_url'] = item['file_path']
                # Convert file path to URL
                item['file_url'] = self._format_recipe_file_url(item['file_path'])
            
            return web.json_response(result)
        except Exception as e:
            logger.error(f"Error retrieving recipes: {e}", exc_info=True)
            print(f"API Error: {e}", file=sys.stderr)
            return web.json_response({"error": str(e)}, status=500)

    async def get_recipe_detail(self, request: web.Request) -> web.Response:
        """Get detailed information about a specific recipe"""
        try:
            recipe_id = request.match_info['recipe_id']
            
            # Get all recipes from cache
            cache = await self.recipe_scanner.get_cached_data()
            
            # Find the specific recipe
            recipe = next((r for r in cache.raw_data if str(r.get('id', '')) == recipe_id), None)
            
            if not recipe:
                return web.json_response({"error": "Recipe not found"}, status=404)
            
            # Format recipe data
            formatted_recipe = self._format_recipe_data(recipe)
            
            return web.json_response(formatted_recipe)
        except Exception as e:
            logger.error(f"Error retrieving recipe details: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)
    
    def _format_recipe_file_url(self, file_path: str) -> str:
        """Format file path for recipe image as a URL"""
        # This is a simplified example - in real implementation, 
        # you would map this to a static route that can serve the file
        
        # For recipes folder in the first lora root
        for idx, root in enumerate(config.loras_roots, start=1):
            recipes_dir = os.path.join(root, "recipes")
            if file_path.startswith(recipes_dir):
                relative_path = os.path.relpath(file_path, root)
                return f"/loras_static/root{idx}/{relative_path}"
        
        return file_path  # Return original path if no mapping found
    
    def _format_recipe_data(self, recipe: Dict) -> Dict:
        """Format recipe data for API response"""
        formatted = {**recipe}  # Copy all fields
        
        # Format file paths to URLs
        if 'file_path' in formatted:
            formatted['file_url'] = self._format_recipe_file_url(formatted['file_path'])
        
        # Format dates for display
        for date_field in ['created_date', 'modified']:
            if date_field in formatted:
                formatted[f"{date_field}_formatted"] = self._format_timestamp(formatted[date_field])
        
        return formatted
    
    def _format_timestamp(self, timestamp: float) -> str:
        """Format timestamp for display"""
        from datetime import datetime
        return datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S') 