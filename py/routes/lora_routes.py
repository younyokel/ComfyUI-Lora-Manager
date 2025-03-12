import os
from aiohttp import web
import jinja2
from typing import Dict, List
import logging
from ..services.lora_scanner import LoraScanner
from ..config import config
from ..services.settings_manager import settings  # Add this import

logger = logging.getLogger(__name__)
logging.getLogger('asyncio').setLevel(logging.CRITICAL)

class LoraRoutes:
    """Route handlers for LoRA management endpoints"""
    
    def __init__(self):
        self.scanner = LoraScanner()
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

    def setup_routes(self, app: web.Application):
        """Register routes with the application"""
        app.router.add_get('/loras', self.handle_loras_page)
