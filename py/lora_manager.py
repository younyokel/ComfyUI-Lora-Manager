import asyncio
from server import PromptServer # type: ignore
from .config import config
from .routes.lora_routes import LoraRoutes
from .routes.api_routes import ApiRoutes
from .routes.recipe_routes import RecipeRoutes
from .routes.checkpoints_routes import CheckpointsRoutes
from .services.service_registry import ServiceRegistry
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
        
        # Get checkpoint scanner instance
        checkpoint_scanner = asyncio.run(ServiceRegistry.get_checkpoint_scanner())
        
        # Add static routes for each checkpoint root
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
        
        # Initialize routes
        lora_routes.setup_routes(app)
        checkpoints_routes.setup_routes(app)
        ApiRoutes.setup_routes(app)
        RecipeRoutes.setup_routes(app)
        
        # Schedule service initialization 
        app.on_startup.append(lambda app: cls._initialize_services())
        
        # Add cleanup
        app.on_shutdown.append(cls._cleanup)
        app.on_shutdown.append(ApiRoutes.cleanup)
    
    @classmethod
    async def _initialize_services(cls):
        """Initialize all services using the ServiceRegistry"""
        try:
            logger.info("LoRA Manager: Initializing services via ServiceRegistry")
            
            # Initialize CivitaiClient first to ensure it's ready for other services
            civitai_client = await ServiceRegistry.get_civitai_client()
            
            # Get file monitors through ServiceRegistry
            lora_monitor = await ServiceRegistry.get_lora_monitor()
            checkpoint_monitor = await ServiceRegistry.get_checkpoint_monitor()
            
            # Start monitors
            lora_monitor.start()
            logger.info("Lora monitor started")
            
            # Make sure checkpoint monitor has paths before starting
            await checkpoint_monitor.initialize_paths()
            checkpoint_monitor.start()
            logger.info("Checkpoint monitor started")

            # Register DownloadManager with ServiceRegistry
            download_manager = await ServiceRegistry.get_download_manager()
            
            # Initialize WebSocket manager
            ws_manager = await ServiceRegistry.get_websocket_manager()
            
            # Initialize scanners in background
            lora_scanner = await ServiceRegistry.get_lora_scanner()
            checkpoint_scanner = await ServiceRegistry.get_checkpoint_scanner()
            
            # Initialize recipe scanner if needed
            recipe_scanner = await ServiceRegistry.get_recipe_scanner()
            
            # Create low-priority initialization tasks
            asyncio.create_task(lora_scanner.initialize_in_background(), name='lora_cache_init')
            asyncio.create_task(checkpoint_scanner.initialize_in_background(), name='checkpoint_cache_init')
            asyncio.create_task(recipe_scanner.initialize_in_background(), name='recipe_cache_init')
            
            logger.info("LoRA Manager: All services initialized and background tasks scheduled")
                
        except Exception as e:
            logger.error(f"LoRA Manager: Error initializing services: {e}", exc_info=True)
    
    @classmethod
    async def _cleanup(cls, app):
        """Cleanup resources using ServiceRegistry"""
        try:
            logger.info("LoRA Manager: Cleaning up services")
            
            # Get monitors from ServiceRegistry
            lora_monitor = await ServiceRegistry.get_service("lora_monitor")
            if lora_monitor:
                lora_monitor.stop()
                logger.info("Stopped LoRA monitor")
                
            checkpoint_monitor = await ServiceRegistry.get_service("checkpoint_monitor")
            if checkpoint_monitor:
                checkpoint_monitor.stop()
                logger.info("Stopped checkpoint monitor")
                
            # Close CivitaiClient gracefully
            civitai_client = await ServiceRegistry.get_service("civitai_client")
            if civitai_client:
                await civitai_client.close()
                logger.info("Closed CivitaiClient connection")
                
        except Exception as e:
            logger.error(f"Error during cleanup: {e}", exc_info=True)
