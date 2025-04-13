import os
from aiohttp import web
import jinja2
from typing import Dict
import logging
from ..config import config
from ..services.settings_manager import settings
from ..services.service_registry import ServiceRegistry  # Add ServiceRegistry import

logger = logging.getLogger(__name__)
logging.getLogger('asyncio').setLevel(logging.CRITICAL)

class LoraRoutes:
    """Route handlers for LoRA management endpoints"""
    
    def __init__(self):
        # Initialize service references as None, will be set during async init
        self.scanner = None
        self.recipe_scanner = None
        self.template_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(config.templates_path),
            autoescape=True
        )

    async def init_services(self):
        """Initialize services from ServiceRegistry"""
        self.scanner = await ServiceRegistry.get_lora_scanner()
        self.recipe_scanner = await ServiceRegistry.get_recipe_scanner()
    
    def format_lora_data(self, lora: Dict) -> Dict:
        """Format LoRA data for template rendering"""
        return {
            "model_name": lora["model_name"],
            "file_name": lora["file_name"],   
            "preview_url": config.get_preview_static_url(lora["preview_url"]),
            "preview_nsfw_level": lora.get("preview_nsfw_level", 0),
            "base_model": lora["base_model"],
            "folder": lora["folder"],
            "sha256": lora["sha256"],
            "file_path": lora["file_path"].replace(os.sep, "/"),
            "size": lora["size"],
            "tags": lora["tags"],
            "modelDescription": lora["modelDescription"],
            "usage_tips": lora["usage_tips"],
            "notes": lora["notes"],
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
            # Ensure services are initialized
            await self.init_services()
            
            # Check if the LoraScanner is initializing
            # It's initializing if the cache object doesn't exist yet,
            # OR if the scanner explicitly says it's initializing (background task running).
            is_initializing = (
                self.scanner._cache is None or
                (hasattr(self.scanner, '_is_initializing') and self.scanner._is_initializing)
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
                    cache = await self.scanner.get_cached_data(force_refresh=False)
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

    async def handle_recipes_page(self, request: web.Request) -> web.Response:
        """Handle GET /loras/recipes request"""
        try:
            # Ensure services are initialized
            await self.init_services()
            
            # Check if the RecipeScanner is initializing
            is_initializing = (
                self.recipe_scanner._cache is None or 
                len(self.recipe_scanner._cache.raw_data) == 0 or
                hasattr(self.recipe_scanner, '_is_initializing') and self.recipe_scanner._is_initializing
            )

            if is_initializing:
                # 如果正在初始化，返回一个只包含加载提示的页面
                template = self.template_env.get_template('recipes.html')
                rendered = template.render(
                    is_initializing=True,
                    settings=settings,
                    request=request  # Pass the request object to the template
                )
                
                logger.info("Recipes page is initializing, returning loading page")
            else:
                # 正常流程 - 获取已经初始化好的缓存数据
                try:
                    cache = await self.recipe_scanner.get_cached_data(force_refresh=False)
                    template = self.template_env.get_template('recipes.html')
                    rendered = template.render(
                        recipes=[],  # Frontend will load recipes via API
                        is_initializing=False,
                        settings=settings,
                        request=request  # Pass the request object to the template
                    )
                except Exception as cache_error:
                    logger.error(f"Error loading recipe cache data: {cache_error}")
                    # 如果获取缓存失败，也显示初始化页面
                    template = self.template_env.get_template('recipes.html')
                    rendered = template.render(
                        is_initializing=True,
                        settings=settings,
                        request=request
                    )
                    logger.info("Recipe cache error, returning initialization page")
            
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
        # Add an app startup handler to initialize services
        app.on_startup.append(self._on_startup)
        
        # Register routes
        app.router.add_get('/loras', self.handle_loras_page)
        app.router.add_get('/loras/recipes', self.handle_recipes_page)
        
    async def _on_startup(self, app):
        """Initialize services when the app starts"""
        await self.init_services()
