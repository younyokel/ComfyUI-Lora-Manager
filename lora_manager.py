from server import PromptServer # type: ignore
from .config import config
from .routes.lora_routes import LoraRoutes
from .routes.api_routes import ApiRoutes

class LoraManager:
    """Main entry point for LoRA Manager plugin"""
    
    @classmethod
    def add_routes(cls):
        """Initialize and register all routes"""
        app = PromptServer.instance.app
        
        # Add static routes for each lora root
        for idx, root in enumerate(config.loras_roots, start=1):
            preview_path = f'/loras_static/root{idx}/preview'
            app.router.add_static(preview_path, root)
        
        # Add static route for plugin assets
        app.router.add_static('/loras_static', config.static_path)
        
        # Setup feature routes
        LoraRoutes.setup_routes(app)
        ApiRoutes.setup_routes(app)