import asyncio
from server import PromptServer # type: ignore
from .config import config
from .routes.lora_routes import LoraRoutes
from .routes.api_routes import ApiRoutes
from .routes.recipe_routes import RecipeRoutes
from .routes.checkpoints_routes import CheckpointsRoutes
from .services.lora_scanner import LoraScanner
from .services.checkpoint_scanner import CheckpointScanner
from .services.recipe_scanner import RecipeScanner
from .services.file_monitor import LoraFileMonitor, CheckpointFileMonitor
import logging

logger = logging.getLogger(__name__)

class LoraManager:
    """Main entry point for LoRA Manager plugin"""
    
    @classmethod
    def add_routes(cls):
        """Initialize and register all routes"""
        app = PromptServer.instance.app

        added_targets = set()  # Track already added target paths
        
        # Add static routes for each lora root
        for idx, root in enumerate(config.loras_roots, start=1):
            preview_path = f'/loras_static/root{idx}/preview'
            
            real_root = root
            if root in config._path_mappings.values():
                for target, link in config._path_mappings.items():
                    if link == root:
                        real_root = target
                        break
            # Add static route for original path
            app.router.add_static(preview_path, real_root)
            logger.info(f"Added static route {preview_path} -> {real_root}")
            
            # Record route mapping
            config.add_route_mapping(real_root, preview_path)
            added_targets.add(real_root)
        
        # Add static routes for each checkpoint root
        checkpoint_scanner = CheckpointScanner()
        for idx, root in enumerate(checkpoint_scanner.get_model_roots(), start=1):
            preview_path = f'/checkpoints_static/root{idx}/preview'
            
            real_root = root
            if root in config._path_mappings.values():
                for target, link in config._path_mappings.items():
                    if link == root:
                        real_root = target
                        break
            # Add static route for original path
            app.router.add_static(preview_path, real_root)
            logger.info(f"Added static route {preview_path} -> {real_root}")
            
            # Record route mapping
            config.add_route_mapping(real_root, preview_path)
            added_targets.add(real_root)
        
        # Add static routes for symlink target paths
        link_idx = 1
        
        for target_path, link_path in config._path_mappings.items():
            if target_path not in added_targets:
                route_path = f'/loras_static/link_{link_idx}/preview'
                app.router.add_static(route_path, target_path)
                logger.info(f"Added static route for link target {route_path} -> {target_path}")
                config.add_route_mapping(target_path, route_path)
                added_targets.add(target_path)
                link_idx += 1
        
        # Add static route for plugin assets
        app.router.add_static('/loras_static', config.static_path)
        
        # Setup feature routes
        lora_routes = LoraRoutes()
        checkpoints_routes = CheckpointsRoutes()
        
        # Setup file monitoring
        lora_monitor = LoraFileMonitor(lora_routes.scanner, config.loras_roots)
        lora_monitor.start()
        
        checkpoint_monitor = CheckpointFileMonitor(checkpoints_routes.scanner, checkpoints_routes.scanner.get_model_roots())
        checkpoint_monitor.start()
        
        lora_routes.setup_routes(app)
        checkpoints_routes.setup_routes(app)
        ApiRoutes.setup_routes(app, lora_monitor)
        RecipeRoutes.setup_routes(app)
        
        # Store monitors in app for cleanup
        app['lora_monitor'] = lora_monitor
        app['checkpoint_monitor'] = checkpoint_monitor

        logger.info("PromptServer app: ", app)
        
        # Schedule cache initialization using the application's startup handler
        app.on_startup.append(lambda app: cls._schedule_cache_init(
            lora_routes.scanner, 
            checkpoints_routes.scanner,
            lora_routes.recipe_scanner
        ))
        
        # Add cleanup
        app.on_shutdown.append(cls._cleanup)
        app.on_shutdown.append(ApiRoutes.cleanup)
    
    @classmethod
    async def _schedule_cache_init(cls, lora_scanner, checkpoint_scanner, recipe_scanner):
        """Schedule cache initialization in the running event loop"""
        try:
            # Create low-priority initialization tasks
            lora_task = asyncio.create_task(lora_scanner.initialize_in_background(), name='lora_cache_init')
            checkpoint_task = asyncio.create_task(checkpoint_scanner.initialize_in_background(), name='checkpoint_cache_init')
            recipe_task = asyncio.create_task(recipe_scanner.initialize_in_background(), name='recipe_cache_init')
        except Exception as e:
            logger.error(f"LoRA Manager: Error scheduling cache initialization: {e}")
    
    @classmethod
    async def _cleanup(cls, app):
        """Cleanup resources"""
        if 'lora_monitor' in app:
            app['lora_monitor'].stop()
            
        if 'checkpoint_monitor' in app:
            app['checkpoint_monitor'].stop()
