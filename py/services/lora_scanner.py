import os
import logging
import asyncio
from typing import List, Dict, Optional

from ..utils.models import LoraMetadata
from ..config import config
from .model_scanner import ModelScanner
from .model_hash_index import ModelHashIndex  # Changed from LoraHashIndex to ModelHashIndex
import sys

logger = logging.getLogger(__name__)

class LoraScanner(ModelScanner):
    """Service for scanning and managing LoRA files"""
    
    _instance = None
    _lock = asyncio.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        # Ensure initialization happens only once
        if not hasattr(self, '_initialized'):
            # Define supported file extensions
            file_extensions = {'.safetensors'}
            
            # Initialize parent class with ModelHashIndex
            super().__init__(
                model_type="lora",
                model_class=LoraMetadata, 
                file_extensions=file_extensions,
                hash_index=ModelHashIndex()  # Changed from LoraHashIndex to ModelHashIndex
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
        """Get lora root directories"""
        return config.loras_roots
        
    async def scan_all_models(self) -> List[Dict]:
        """Scan all LoRA directories and return metadata"""
        all_loras = []
        
        # Create scan tasks for each directory
        scan_tasks = []
        for lora_root in self.get_model_roots():
            task = asyncio.create_task(self._scan_directory(lora_root))
            scan_tasks.append(task)
            
        # Wait for all tasks to complete
        for task in scan_tasks:
            try:
                loras = await task
                all_loras.extend(loras)
            except Exception as e:
                logger.error(f"Error scanning directory: {e}")
                
        return all_loras
    
    async def _scan_directory(self, root_path: str) -> List[Dict]:
        """Scan a single directory for LoRA files"""
        loras = []
        original_root = root_path  # Save original root path
        
        async def scan_recursive(path: str, visited_paths: set):
            """Recursively scan directory, avoiding circular symlinks"""
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
                            if entry.is_file(follow_symlinks=True) and any(entry.name.endswith(ext) for ext in self.file_extensions):
                                # Use original path instead of real path
                                file_path = entry.path.replace(os.sep, "/")
                                await self._process_single_file(file_path, original_root, loras)
                                await asyncio.sleep(0)
                            elif entry.is_dir(follow_symlinks=True):
                                # For directories, continue scanning with original path
                                await scan_recursive(entry.path, visited_paths)
                        except Exception as e:
                            logger.error(f"Error processing entry {entry.path}: {e}")
            except Exception as e:
                logger.error(f"Error scanning {path}: {e}")

        await scan_recursive(root_path, set())
        return loras

    async def _process_single_file(self, file_path: str, root_path: str, loras: list):
        """Process a single file and add to results list"""
        try:
            result = await self._process_model_file(file_path, root_path)
            if result:
                loras.append(result)
        except Exception as e:
            logger.error(f"Error processing {file_path}: {e}")

    # Lora-specific hash index functionality
    def has_lora_hash(self, sha256: str) -> bool:
        """Check if a LoRA with given hash exists"""
        return self.has_hash(sha256)
        
    def get_lora_path_by_hash(self, sha256: str) -> Optional[str]:
        """Get file path for a LoRA by its hash"""
        return self.get_path_by_hash(sha256)
        
    def get_lora_hash_by_path(self, file_path: str) -> Optional[str]:
        """Get hash for a LoRA by its file path"""
        return self.get_hash_by_path(file_path)

    async def diagnose_hash_index(self):
        """Diagnostic method to verify hash index functionality"""
        print("\n\n*** DIAGNOSING LORA HASH INDEX ***\n\n", file=sys.stderr)
        
        # First check if the hash index has any entries
        if hasattr(self, '_hash_index'):
            index_entries = len(self._hash_index._hash_to_path)
            print(f"Hash index has {index_entries} entries", file=sys.stderr)
            
            # Print a few example entries if available
            if index_entries > 0:
                print("\nSample hash index entries:", file=sys.stderr)
                count = 0
                for hash_val, path in self._hash_index._hash_to_path.items():
                    if count < 5:  # Just show the first 5
                        print(f"Hash: {hash_val[:8]}... -> Path: {path}", file=sys.stderr)
                        count += 1
                    else:
                        break
        else:
            print("Hash index not initialized", file=sys.stderr)
        
        # Try looking up by a known hash for testing
        if not hasattr(self, '_hash_index') or not self._hash_index._hash_to_path:
            print("No hash entries to test lookup with", file=sys.stderr)
            return
        
        test_hash = next(iter(self._hash_index._hash_to_path.keys()))
        test_path = self._hash_index.get_path(test_hash)
        print(f"\nTest lookup by hash: {test_hash[:8]}... -> {test_path}", file=sys.stderr)
        
        # Also test reverse lookup
        test_hash_result = self._hash_index.get_hash(test_path)
        print(f"Test reverse lookup: {test_path} -> {test_hash_result[:8]}...\n\n", file=sys.stderr)

    async def get_lora_info_by_name(self, name):
        """Get LoRA information by name"""
        try:
            # Get cached data
            cache = await self.get_cached_data()
            
            # Find the LoRA by name
            for lora in cache.raw_data:
                if lora.get("file_name") == name:
                    return lora
                    
            return None
        except Exception as e:
            logger.error(f"Error getting LoRA info by name: {e}", exc_info=True)
            return None

