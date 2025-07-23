import os
import logging
import asyncio
from typing import List, Dict

from ..utils.models import CheckpointMetadata
from ..config import config
from .model_scanner import ModelScanner
from .model_hash_index import ModelHashIndex

logger = logging.getLogger(__name__)

class CheckpointScanner(ModelScanner):
    """Service for scanning and managing checkpoint files"""
    
    _instance = None
    _lock = asyncio.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, '_initialized'):
            # Define supported file extensions
            file_extensions = {'.safetensors', '.ckpt', '.pt', '.pth', '.sft', '.gguf'}
            super().__init__(
                model_type="checkpoint",
                model_class=CheckpointMetadata,
                file_extensions=file_extensions,
                hash_index=ModelHashIndex()
            )
            self._initialized = True

    @classmethod
    async def get_instance(cls):
        """Get singleton instance with async support"""
        async with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance
    
    def get_model_roots(self) -> List[str]:
        """Get checkpoint root directories"""
        return config.base_models_roots
        
    async def scan_all_models(self) -> List[Dict]:
        """Scan all checkpoint directories and return metadata"""
        all_checkpoints = []
        
        # Create scan tasks for each directory
        scan_tasks = []
        for root in self.get_model_roots():
            task = asyncio.create_task(self._scan_directory(root))
            scan_tasks.append(task)
            
        # Wait for all tasks to complete
        for task in scan_tasks:
            try:
                checkpoints = await task
                all_checkpoints.extend(checkpoints)
            except Exception as e:
                logger.error(f"Error scanning checkpoint directory: {e}")
                
        return all_checkpoints
    
    async def _scan_directory(self, root_path: str) -> List[Dict]:
        """Scan a directory for checkpoint files"""
        checkpoints = []
        original_root = root_path

        async def scan_recursive(path: str, visited_paths: set):
            try:
                real_path = os.path.realpath(path)
                if real_path in visited_paths:
                    logger.debug(f"Skipping already visited path: {path}")
                    return
                visited_paths.add(real_path)
                
                with os.scandir(path) as it:
                    entries = list(it)
                    for entry in entries:
                        try:
                            if entry.is_file(follow_symlinks=True):
                                # Check if file has supported extension
                                ext = os.path.splitext(entry.name)[1].lower()
                                if ext in self.file_extensions:
                                    file_path = entry.path.replace(os.sep, "/")
                                    await self._process_single_file(file_path, original_root, checkpoints)
                                    await asyncio.sleep(0)
                            elif entry.is_dir(follow_symlinks=True):
                                # For directories, continue scanning with original path
                                await scan_recursive(entry.path, visited_paths)
                        except Exception as e:
                            logger.error(f"Error processing entry {entry.path}: {e}")
            except Exception as e:
                logger.error(f"Error scanning {path}: {e}")
        
        await scan_recursive(root_path, set())
        return checkpoints

    async def _process_single_file(self, file_path: str, root_path: str, checkpoints: list):
        """Process a single checkpoint file and add to results"""
        try:
            result = await self._process_model_file(file_path, root_path)
            if result:
                checkpoints.append(result)
        except Exception as e:
            logger.error(f"Error processing {file_path}: {e}")

    # Checkpoint-specific hash index functionality
    def has_checkpoint_hash(self, sha256: str) -> bool:
        """Check if a checkpoint with given hash exists"""
        return self.has_hash(sha256)
        
    def get_checkpoint_path_by_hash(self, sha256: str) -> str:
        """Get file path for a checkpoint by its hash"""
        return self.get_path_by_hash(sha256)
        
    def get_checkpoint_hash_by_path(self, file_path: str) -> str:
        """Get hash for a checkpoint by its file path"""
        return self.get_hash_by_path(file_path)

    async def get_checkpoint_info_by_name(self, name):
        """Get checkpoint information by name"""
        try:
            cache = await self.get_cached_data()
            
            for checkpoint in cache.raw_data:
                if checkpoint.get("file_name") == name:
                    return checkpoint
                    
            return None
        except Exception as e:
            logger.error(f"Error getting checkpoint info by name: {e}", exc_info=True)
            return None