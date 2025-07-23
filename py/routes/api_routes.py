import logging
from aiohttp import web

from ..services.websocket_manager import ws_manager
from .update_routes import UpdateRoutes
from .lora_routes import LoraRoutes

logger = logging.getLogger(__name__)

class ApiRoutes:
    """Legacy API route handlers for backward compatibility"""

    def __init__(self):
        # Initialize the new LoRA routes
        self.lora_routes = LoraRoutes()

    @classmethod
    def setup_routes(cls, app: web.Application):
        """Register API routes using the new refactored architecture"""
        routes = cls()
        
        # Setup the refactored LoRA routes
        routes.lora_routes.setup_routes(app)
        
        # Setup WebSocket routes that are still shared
        app.router.add_get('/ws/fetch-progress', ws_manager.handle_connection)
        app.router.add_get('/ws/download-progress', ws_manager.handle_download_connection)
        app.router.add_get('/ws/init-progress', ws_manager.handle_init_connection)
        
        # Setup update routes that are not model-specific
        UpdateRoutes.setup_routes(app)

    @classmethod
    async def cleanup(cls):
        """Add cleanup method for application shutdown"""
        # Cleanup is now handled by ServiceRegistry and individual services
        pass
