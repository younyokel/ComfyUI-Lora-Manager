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
            # 检查缓存初始化状态，根据initialize_in_background的工作方式调整判断逻辑
            is_initializing = (
                self.scanner._cache is None or 
                len(self.scanner._cache.raw_data) == 0 or
                hasattr(self.scanner, '_is_initializing') and self.scanner._is_initializing
            )

            if is_initializing:
                # 如果正在初始化，返回一个只包含加载提示的页面
                template = self.template_env.get_template('loras.html')
                rendered = template.render(
                    folders=[],  # 空文件夹列表
                    is_initializing=True,  # 新增标志
                    settings=settings,  # Pass settings to template
                    request=request  # Pass the request object to the template
                )
                
                logger.info("Loras page is initializing, returning loading page")
            else:
                # 正常流程 - 获取已经初始化好的缓存数据
                try:
                    cache = await self.scanner.get_cached_data(force_refresh=False)
                    template = self.template_env.get_template('loras.html')
                    rendered = template.render(
                        folders=cache.folders,
                        is_initializing=False,
                        settings=settings,  # Pass settings to template
                        request=request  # Pass the request object to the template
                    )
                    logger.debug(f"Loras page loaded successfully with {len(cache.raw_data)} items")
                except Exception as cache_error:
                    logger.error(f"Error loading cache data: {cache_error}")
                    # 如果获取缓存失败，也显示初始化页面
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
            # 检查缓存初始化状态，与handle_loras_page保持一致的逻辑
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
                    logger.debug(f"Recipes page loaded successfully with {len(cache.raw_data)} items")
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
        app.router.add_get('/loras', self.handle_loras_page)
        app.router.add_get('/loras/recipes', self.handle_recipes_page)
