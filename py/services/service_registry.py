import asyncio
import logging
from typing import Optional, Dict, Any, TypeVar, Type

logger = logging.getLogger(__name__)

T = TypeVar('T')  # Define a type variable for service types

class ServiceRegistry:
    """Centralized registry for service singletons"""
    
    _instance = None
    _services: Dict[str, Any] = {}
    _lock = asyncio.Lock()
    
    @classmethod
    def get_instance(cls):
        """Get singleton instance of the registry"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    @classmethod
    async def register_service(cls, service_name: str, service_instance: Any) -> None:
        """Register a service instance with the registry"""
        registry = cls.get_instance()
        async with cls._lock:
            registry._services[service_name] = service_instance
            logger.debug(f"Registered service: {service_name}")
    
    @classmethod
    async def get_service(cls, service_name: str) -> Any:
        """Get a service instance by name"""
        registry = cls.get_instance()
        async with cls._lock:
            if service_name not in registry._services:
                logger.warning(f"Service {service_name} not found in registry")
                return None
            return registry._services[service_name]
    
    # Convenience methods for common services
    @classmethod
    async def get_lora_scanner(cls):
        """Get the LoraScanner instance"""
        from .lora_scanner import LoraScanner
        scanner = await cls.get_service("lora_scanner")
        if scanner is None:
            scanner = await LoraScanner.get_instance()
            await cls.register_service("lora_scanner", scanner)
        return scanner
        
    @classmethod
    async def get_checkpoint_scanner(cls):
        """Get the CheckpointScanner instance"""
        from .checkpoint_scanner import CheckpointScanner
        scanner = await cls.get_service("checkpoint_scanner")
        if scanner is None:
            scanner = await CheckpointScanner.get_instance()
            await cls.register_service("checkpoint_scanner", scanner)
        return scanner
    
    @classmethod
    async def get_lora_monitor(cls):
        """Get the LoraFileMonitor instance"""
        from .file_monitor import LoraFileMonitor
        monitor = await cls.get_service("lora_monitor")
        if monitor is None:
            monitor = await LoraFileMonitor.get_instance()
            await cls.register_service("lora_monitor", monitor)
        return monitor
    
    @classmethod
    async def get_checkpoint_monitor(cls):
        """Get the CheckpointFileMonitor instance"""
        from .file_monitor import CheckpointFileMonitor
        monitor = await cls.get_service("checkpoint_monitor")
        if monitor is None:
            monitor = await CheckpointFileMonitor.get_instance()
            await cls.register_service("checkpoint_monitor", monitor)
        return monitor

    @classmethod
    async def get_civitai_client(cls):
        """Get the CivitaiClient instance"""
        from .civitai_client import CivitaiClient
        client = await cls.get_service("civitai_client")
        if client is None:
            client = await CivitaiClient.get_instance()
            await cls.register_service("civitai_client", client)
        return client

    @classmethod
    async def get_download_manager(cls):
        """Get the DownloadManager instance"""
        from .download_manager import DownloadManager
        manager = await cls.get_service("download_manager")
        if manager is None:
            # We'll let DownloadManager.get_instance handle file_monitor parameter
            manager = await DownloadManager.get_instance()
            await cls.register_service("download_manager", manager)
        return manager

    @classmethod
    async def get_recipe_scanner(cls):
        """Get the RecipeScanner instance"""
        from .recipe_scanner import RecipeScanner
        scanner = await cls.get_service("recipe_scanner")
        if scanner is None:
            lora_scanner = await cls.get_lora_scanner()
            scanner = RecipeScanner(lora_scanner)
            await cls.register_service("recipe_scanner", scanner)
        return scanner

    @classmethod
    async def get_websocket_manager(cls):
        """Get the WebSocketManager instance"""
        from .websocket_manager import ws_manager
        manager = await cls.get_service("websocket_manager")
        if manager is None:
            # ws_manager is already a global instance in websocket_manager.py
            from .websocket_manager import ws_manager
            await cls.register_service("websocket_manager", ws_manager)
            manager = ws_manager
        return manager