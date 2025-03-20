import os
from aiohttp import web
import jinja2
import logging
from ..config import config
from ..services.settings_manager import settings

logger = logging.getLogger(__name__)
logging.getLogger('asyncio').setLevel(logging.CRITICAL)

class CheckpointsRoutes:
    """Route handlers for Checkpoints management endpoints"""
    
    def __init__(self):
        self.template_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(config.templates_path),
            autoescape=True
        )

    async def handle_checkpoints_page(self, request: web.Request) -> web.Response:
        """Handle GET /checkpoints request"""
        try:
            template = self.template_env.get_template('checkpoints.html')
            rendered = template.render(
                is_initializing=False,
                settings=settings,
                request=request
            )
            
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

    def setup_routes(self, app: web.Application):
        """Register routes with the application"""
        app.router.add_get('/checkpoints', self.handle_checkpoints_page)
