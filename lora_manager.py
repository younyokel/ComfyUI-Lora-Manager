import asyncio
from server import PromptServer # type: ignore
from .config import config
from .routes.lora_routes import LoraRoutes
from .routes.api_routes import ApiRoutes
from .services.lora_scanner import LoraScanner
from .services.file_monitor import LoraFileMonitor
from .services.lora_cache import LoraCache

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
        routes = LoraRoutes()
        
        # Setup file monitoring
        monitor = LoraFileMonitor(routes.scanner, config.loras_roots)
        monitor.start()
        
        routes.setup_routes(app)
        ApiRoutes.setup_routes(app, monitor)
        
        # Store monitor in app for cleanup
        app['lora_monitor'] = monitor
        
        # Schedule cache initialization using the application's startup handler
        app.on_startup.append(lambda app: cls._schedule_cache_init(routes.scanner))
        
        # Add cleanup
        app.on_shutdown.append(cls._cleanup)
        app.on_shutdown.append(ApiRoutes.cleanup)
    
    @classmethod
    async def _schedule_cache_init(cls, scanner: LoraScanner):
        """Schedule cache initialization in the running event loop"""
        try:
            # 创建低优先级的初始化任务
            asyncio.create_task(cls._initialize_cache(scanner), name='lora_cache_init')
        except Exception as e:
            print(f"LoRA Manager: Error scheduling cache initialization: {e}")
    
    @classmethod
    async def _initialize_cache(cls, scanner: LoraScanner):
        """Initialize cache in background"""
        try:
            # 设置初始缓存占位
            scanner._cache = LoraCache(
                raw_data=[],
                sorted_by_name=[],
                sorted_by_date=[],
                folders=[]
            )
            
            # 分阶段加载缓存
            await scanner.get_cached_data(force_refresh=True)
            print("LoRA Manager: Cache initialization completed")
        except Exception as e:
            print(f"LoRA Manager: Error initializing cache: {e}")
    
    @classmethod
    async def _cleanup(cls, app):
        """Cleanup resources"""
        if 'lora_monitor' in app:
            app['lora_monitor'].stop()