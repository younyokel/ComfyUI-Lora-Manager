import os
import logging
import asyncio
from typing import List, Dict, Optional, Set
import folder_paths # type: ignore

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
            self._checkpoint_roots = self._init_checkpoint_roots()
            self._initialized = True

    @classmethod
    async def get_instance(cls):
        """Get singleton instance with async support"""
        async with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance
    
    def _init_checkpoint_roots(self) -> List[str]:
        """Initialize checkpoint roots from ComfyUI settings"""
        # Get both checkpoint and diffusion_models paths
        checkpoint_paths = folder_paths.get_folder_paths("checkpoints")
        diffusion_paths = folder_paths.get_folder_paths("diffusion_models")
        
        # Combine, normalize and deduplicate paths
        all_paths = set()
        for path in checkpoint_paths + diffusion_paths:
            if os.path.exists(path):
                norm_path = path.replace(os.sep, "/")
                all_paths.add(norm_path)
        
        # Sort for consistent order
        sorted_paths = sorted(all_paths, key=lambda p: p.lower())
        logger.info(f"Found checkpoint roots: {sorted_paths}")
        
        return sorted_paths
    
    def get_model_roots(self) -> List[str]:
        """Get checkpoint root directories"""
        return self._checkpoint_roots
        
    async def scan_all_models(self) -> List[Dict]:
        """Scan all checkpoint directories and return metadata"""
        all_checkpoints = []
        
        # Create scan tasks for each directory
        scan_tasks = []
        for root in self._checkpoint_roots:
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