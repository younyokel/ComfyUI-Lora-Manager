import os
from aiohttp import web
import jinja2
from typing import Dict, List
import logging
from ..services.lora_scanner import LoraScanner
from ..services.recipe_scanner import RecipeScanner
from ..config import config
from ..services.settings_manager import settings  # Add this import

logger = logging.getLogger(__name__)
logging.getLogger('asyncio').setLevel(logging.CRITICAL)

class LoraRoutes:
    """Route handlers for LoRA management endpoints"""
    
    def __init__(self):
        self.scanner = LoraScanner()
        self.recipe_scanner = RecipeScanner(self.scanner)
        self.template_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(config.templates_path),
            autoescape=True
        )

    def format_lora_data(self, lora: Dict) -> Dict:
        """Format LoRA data for template rendering"""
        return {
            "model_name": lora["model_name"],
            "file_name": lora["file_name"],   
            "preview_url": config.get_preview_static_url(lora["preview_url"]),
            "base_model": lora["base_model"],
            "folder": lora["folder"],
            "sha256": lora["sha256"],
            "file_path": lora["file_path"].replace(os.sep, "/"),
            "modified": lora["modified"],
            "from_civitai": lora.get("from_civitai", True),
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

    async def handle_loras_page(self, request: web.Request) -> web.Response:
        """Handle GET /loras request"""
        try:
            # 不等待缓存数据，直接检查缓存状态
            is_initializing = (
                self.scanner._cache is None and 
                (self.scanner._initialization_task is not None and 
                not self.scanner._initialization_task.done())
            )

            if is_initializing:
                # 如果正在初始化，返回一个只包含加载提示的页面
                template = self.template_env.get_template('loras.html')
                rendered = template.render(
                    folders=[],  # 空文件夹列表
                    is_initializing=True,  # 新增标志
                    settings=settings  # Pass settings to template
                )
            else:
                # 正常流程
                cache = await self.scanner.get_cached_data()
                template = self.template_env.get_template('loras.html')
                rendered = template.render(
                    folders=cache.folders,
                    is_initializing=False,
                    settings=settings  # Pass settings to template
                )
            
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

    async def handle_recipes_page(self, request: web.Request) -> web.Response:
        """Handle GET /loras/recipes request"""
        try:
            # Check cache initialization status
            is_initializing = (
                self.recipe_scanner._cache is None and 
                (self.recipe_scanner._initialization_task is not None and 
                not self.recipe_scanner._initialization_task.done())
            )

            if is_initializing:
                # If initializing, return a loading page
                template = self.template_env.get_template('recipes.html')
                rendered = template.render(
                    is_initializing=True,
                    settings=settings
                )
            else:
                # Normal flow - get recipes with the same formatting as the API endpoint
                cache = await self.recipe_scanner.get_cached_data()
                recipes_data = cache.sorted_by_name[:20]  # Show first 20 recipes by name
                
                # Format the response data with static URLs for file paths - same as in recipe_routes
                for item in recipes_data:
                    # Always ensure file_url is set
                    if 'file_path' in item:
                        item['file_url'] = self._format_recipe_file_url(item['file_path'])
                    else:
                        item['file_url'] = '/loras_static/images/no-preview.png'
                    
                    # Ensure loras array exists
                    if 'loras' not in item:
                        item['loras'] = []
                        
                    # Ensure base_model field exists
                    if 'base_model' not in item:
                        item['base_model'] = ""
                
                template = self.template_env.get_template('recipes.html')
                rendered = template.render(
                    recipes=recipes_data,
                    is_initializing=False,
                    settings=settings
                )
            
            return web.Response(
                text=rendered,
                content_type='text/html'
            )
            
        except Exception as e:
            logger.error(f"Error handling recipes request: {e}", exc_info=True)
            return web.Response(
                text="Error loading recipes page",
                status=500
            )

    def _format_recipe_file_url(self, file_path: str) -> str:
        """Format file path for recipe image as a URL - same as in recipe_routes"""
        try:
            # Return the file URL directly for the first lora root's preview
            recipes_dir = os.path.join(config.loras_roots[0], "recipes").replace(os.sep, '/')
            if file_path.replace(os.sep, '/').startswith(recipes_dir):
                relative_path = os.path.relpath(file_path, config.loras_roots[0]).replace(os.sep, '/')
                return f"/loras_static/root1/preview/{relative_path}" 
            
            # If not in recipes dir, try to create a valid URL from the file path
            file_name = os.path.basename(file_path)
            return f"/loras_static/root1/preview/recipes/{file_name}"
        except Exception as e:
            logger.error(f"Error formatting recipe file URL: {e}", exc_info=True)
            return '/loras_static/images/no-preview.png'  # Return default image on error

    def setup_routes(self, app: web.Application):
        """Register routes with the application"""
        app.router.add_get('/loras', self.handle_loras_page)
        app.router.add_get('/loras/recipes', self.handle_recipes_page)
