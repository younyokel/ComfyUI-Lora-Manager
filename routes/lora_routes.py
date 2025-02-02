import os
from aiohttp import web
import jinja2
from typing import Dict, List
import logging
from ..services.lora_scanner import LoraScanner
from ..config import config

logger = logging.getLogger(__name__)

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
            # Get cached data
            cache = await self.scanner.get_cached_data()
            
            # Format initial data (first page only)
            initial_data = await self.scanner.get_paginated_data(
                page=1,
                page_size=20,
                sort_by='name'
            )
            
            formatted_loras = [
                self.format_lora_data(l) 
                for l in initial_data['items']
            ]
            
            # Render template
            template = self.template_env.get_template('loras.html')
            rendered = template.render(
                loras=formatted_loras,
                folders=cache.folders,
                total_items=initial_data['total']
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

    @classmethod
    def setup_routes(cls, app: web.Application):
        """Register routes with the application"""
        routes = cls()
        app.router.add_get('/loras', routes.handle_loras_page)
