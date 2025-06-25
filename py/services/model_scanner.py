import json
import os
import logging
import asyncio
import time
import shutil
from typing import List, Dict, Optional, Type, Set
import msgpack  # Add MessagePack import for efficient serialization

from ..utils.models import BaseModelMetadata
from ..config import config
from ..utils.file_utils import find_preview_file
from ..utils.metadata_manager import MetadataManager
from .model_cache import ModelCache
from .model_hash_index import ModelHashIndex
from ..utils.constants import PREVIEW_EXTENSIONS
from .service_registry import ServiceRegistry
from .websocket_manager import ws_manager

logger = logging.getLogger(__name__)

# Define cache version to handle future format changes
# Version history:
# 1 - Initial version
# 2 - Added duplicate_filenames and duplicate_hashes tracking
# 3 - Added _excluded_models list to cache
CACHE_VERSION = 3

class ModelScanner:
    """Base service for scanning and managing model files"""
    
    _lock = asyncio.Lock()
    
    def __init__(self, model_type: str, model_class: Type[BaseModelMetadata], file_extensions: Set[str], hash_index: Optional[ModelHashIndex] = None):
        """Initialize the scanner
        
        Args:
            model_type: Type of model (lora, checkpoint, etc.)
            model_class: Class used to create metadata instances
            file_extensions: Set of supported file extensions including the dot (e.g. {'.safetensors'})
            hash_index: Hash index instance (optional)
        """
        self.model_type = model_type
        self.model_class = model_class
        self.file_extensions = file_extensions
        self._cache = None
        self._hash_index = hash_index or ModelHashIndex()
        self._tags_count = {}  # Dictionary to store tag counts
        self._is_initializing = False  # Flag to track initialization state
        self._excluded_models = []  # List to track excluded models
        self._dirs_last_modified = {}  # Track directory modification times
        self._use_cache_files = False  # Flag to control cache file usage, default to disabled
        
        # Clear cache files if disabled
        if not self._use_cache_files:
            self._clear_cache_files()
        
        # Register this service
        asyncio.create_task(self._register_service())
    
    def _clear_cache_files(self):
        """Clear existing cache files if they exist"""
        try:
            cache_path = self._get_cache_file_path()
            if cache_path and os.path.exists(cache_path):
                os.remove(cache_path)
                logger.info(f"Cleared {self.model_type} cache file: {cache_path}")
        except Exception as e:
            logger.error(f"Error clearing {self.model_type} cache file: {e}")
    
    async def _register_service(self):
        """Register this instance with the ServiceRegistry"""
        service_name = f"{self.model_type}_scanner"
        await ServiceRegistry.register_service(service_name, self)
    
    def _get_cache_file_path(self) -> Optional[str]:
        """Get the path to the cache file"""
        # Get the directory where this module is located
        current_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.realpath(__file__))))
        
        # Create a cache directory within the project if it doesn't exist
        cache_dir = os.path.join(current_dir, "cache")
        os.makedirs(cache_dir, exist_ok=True)
        
        # Create filename based on model type
        cache_filename = f"lm_{self.model_type}_cache.msgpack"
        return os.path.join(cache_dir, cache_filename)

    def _prepare_for_msgpack(self, data):
        """Preprocess data to accommodate MessagePack serialization limitations
        
        Converts integers exceeding safe range to strings
        
        Args:
            data: Any type of data structure
            
        Returns:
            Preprocessed data structure with large integers converted to strings
        """
        if isinstance(data, dict):
            return {k: self._prepare_for_msgpack(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._prepare_for_msgpack(item) for item in data]
        elif isinstance(data, int) and (data > 9007199254740991 or data < -9007199254740991):
            # Convert integers exceeding JavaScript's safe integer range (2^53-1) to strings
            return str(data)
        else:
            return data

    async def _save_cache_to_disk(self) -> bool:
        """Save cache data to disk using MessagePack"""
        if not self._use_cache_files:
            logger.debug(f"Cache files disabled for {self.model_type}, skipping save")
            return False
            
        if self._cache is None or not self._cache.raw_data:
            logger.debug(f"No {self.model_type} cache data to save")
            return False
            
        cache_path = self._get_cache_file_path()
        if not cache_path:
            logger.warning(f"Cannot determine {self.model_type} cache file location")
            return False
            
        try:
            # Create cache data structure
            cache_data = {
                "version": CACHE_VERSION,
                "timestamp": time.time(),
                "model_type": self.model_type,
                "raw_data": self._cache.raw_data,
                "hash_index": {
                    "hash_to_path": self._hash_index._hash_to_path,
                    "filename_to_hash": self._hash_index._filename_to_hash,  # Fix: changed from path_to_hash to filename_to_hash
                    "duplicate_hashes": self._hash_index._duplicate_hashes,
                    "duplicate_filenames": self._hash_index._duplicate_filenames
                },
                "tags_count": self._tags_count,
                "dirs_last_modified": self._get_dirs_last_modified(),
                "excluded_models": self._excluded_models  # Add excluded_models to cache data
            }
            
            # Preprocess data to handle large integers
            processed_cache_data = self._prepare_for_msgpack(cache_data)
            
            # Write to temporary file first (atomic operation)
            temp_path = f"{cache_path}.tmp"
            with open(temp_path, 'wb') as f:
                msgpack.pack(processed_cache_data, f)
                
            # Replace the old file with the new one
            if os.path.exists(cache_path):
                os.replace(temp_path, cache_path)
            else:
                os.rename(temp_path, cache_path)
                
            logger.info(f"Saved {self.model_type} cache with {len(self._cache.raw_data)} models to {cache_path}")
            logger.debug(f"Hash index stats - hash_to_path: {len(self._hash_index._hash_to_path)}, filename_to_hash: {len(self._hash_index._filename_to_hash)}, duplicate_hashes: {len(self._hash_index._duplicate_hashes)}, duplicate_filenames: {len(self._hash_index._duplicate_filenames)}")
            return True
        except Exception as e:
            logger.error(f"Error saving {self.model_type} cache to disk: {e}")
            # Try to clean up temp file if it exists
            if 'temp_path' in locals() and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except:
                    pass
            return False
    
    def _get_dirs_last_modified(self) -> Dict[str, float]:
        """Get last modified time for all model directories"""
        dirs_info = {}
        for root in self.get_model_roots():
            if os.path.exists(root):
                dirs_info[root] = os.path.getmtime(root)
                # Also check immediate subdirectories for changes
                try:
                    with os.scandir(root) as it:
                        for entry in it:
                            if entry.is_dir(follow_symlinks=True):
                                dirs_info[entry.path] = entry.stat().st_mtime
                except Exception as e:
                    logger.error(f"Error getting directory info for {root}: {e}")
        return dirs_info
                
    def _is_cache_valid(self, cache_data: Dict) -> bool:
        """Validate if the loaded cache is still valid"""
        if not cache_data or cache_data.get("version") != CACHE_VERSION:
            logger.info(f"Cache invalid - version mismatch. Got: {cache_data.get('version')}, Expected: {CACHE_VERSION}")
            return False
            
        if cache_data.get("model_type") != self.model_type:
            logger.info(f"Cache invalid - model type mismatch. Got: {cache_data.get('model_type')}, Expected: {self.model_type}")
            return False
                
        return True
        
    async def _load_cache_from_disk(self) -> bool:
        """Load cache data from disk using MessagePack"""
        if not self._use_cache_files:
            logger.info(f"Cache files disabled for {self.model_type}, skipping load")
            return False
            
        start_time = time.time()
        cache_path = self._get_cache_file_path()
        if not cache_path or not os.path.exists(cache_path):
            return False
            
        try:
            with open(cache_path, 'rb') as f:
                cache_data = msgpack.unpack(f)
                
            # Validate cache data
            if not self._is_cache_valid(cache_data):
                logger.info(f"{self.model_type.capitalize()} cache file found but invalid or outdated")
                return False
                
            # Load data into memory
            self._cache = ModelCache(
                raw_data=cache_data["raw_data"],
                sorted_by_name=[],
                sorted_by_date=[],
                folders=[]
            )
            
            # Load hash index
            hash_index_data = cache_data.get("hash_index", {})
            self._hash_index._hash_to_path = hash_index_data.get("hash_to_path", {})
            self._hash_index._filename_to_hash = hash_index_data.get("filename_to_hash", {})  # Fix: changed from path_to_hash to filename_to_hash
            self._hash_index._duplicate_hashes = hash_index_data.get("duplicate_hashes", {})
            self._hash_index._duplicate_filenames = hash_index_data.get("duplicate_filenames", {})
            
            # Load tags count
            self._tags_count = cache_data.get("tags_count", {})
            
            # Load excluded models
            self._excluded_models = cache_data.get("excluded_models", [])
            
            # Resort the cache
            await self._cache.resort()
            
            logger.info(f"Loaded {self.model_type} cache from disk with {len(self._cache.raw_data)} models in {time.time() - start_time:.2f} seconds")
            return True
        except Exception as e:
            logger.error(f"Error loading {self.model_type} cache from disk: {e}")
            return False

    async def initialize_in_background(self) -> None:
        """Initialize cache in background using thread pool"""
        try:
            # Set initial empty cache to avoid None reference errors
            if self._cache is None:
                self._cache = ModelCache(
                    raw_data=[],
                    sorted_by_name=[],
                    sorted_by_date=[],
                    folders=[]
                )
            
            # Set initializing flag to true
            self._is_initializing = True
            
            # Determine the page type based on model type
            page_type = 'loras' if self.model_type == 'lora' else 'checkpoints'
            
            # First, try to load from cache
            await ws_manager.broadcast_init_progress({
                'stage': 'loading_cache',
                'progress': 0,
                'details': f"Loading {self.model_type} cache...",
                'scanner_type': self.model_type,
                'pageType': page_type
            })
            
            cache_loaded = await self._load_cache_from_disk()
            
            if cache_loaded:
                # Cache loaded successfully, broadcast complete message
                await ws_manager.broadcast_init_progress({
                    'stage': 'finalizing',
                    'progress': 100,
                    'status': 'complete',
                    'details': f"Loaded {len(self._cache.raw_data)} {self.model_type} files from cache.",
                    'scanner_type': self.model_type,
                    'pageType': page_type
                })
                self._is_initializing = False
                return
                
            # If cache loading failed, proceed with full scan
            await ws_manager.broadcast_init_progress({
                'stage': 'scan_folders',
                'progress': 0,
                'details': f"Scanning {self.model_type} folders...",
                'scanner_type': self.model_type,
                'pageType': page_type
            })
            
            # Count files in a separate thread to avoid blocking
            loop = asyncio.get_event_loop()
            total_files = await loop.run_in_executor(
                None,  # Use default thread pool
                self._count_model_files  # Run file counting in thread
            )
            
            await ws_manager.broadcast_init_progress({
                'stage': 'count_models',
                'progress': 1, # Changed from 10 to 1
                'details': f"Found {total_files} {self.model_type} files",
                'scanner_type': self.model_type,
                'pageType': page_type
            })
            
            start_time = time.time()
            
            # Use thread pool to execute CPU-intensive operations with progress reporting
            await loop.run_in_executor(
                None,  # Use default thread pool
                self._initialize_cache_sync,  # Run synchronous version in thread
                total_files,  # Pass the total file count for progress reporting
                page_type  # Pass the page type for progress reporting
            )
            
            # Send final progress update
            await ws_manager.broadcast_init_progress({
                'stage': 'finalizing',
                'progress': 99, # Changed from 95 to 99
                'details': f"Finalizing {self.model_type} cache...",
                'scanner_type': self.model_type,
                'pageType': page_type
            })
            
            logger.info(f"{self.model_type.capitalize()} cache initialized in {time.time() - start_time:.2f} seconds. Found {len(self._cache.raw_data)} models")
            
            # Save the cache to disk after initialization
            await self._save_cache_to_disk()
            
            # Send completion message
            await asyncio.sleep(0.5)  # Small delay to ensure final progress message is sent
            await ws_manager.broadcast_init_progress({
                'stage': 'finalizing',
                'progress': 100,
                'status': 'complete',
                'details': f"Completed! Found {len(self._cache.raw_data)} {self.model_type} files.",
                'scanner_type': self.model_type,
                'pageType': page_type
            })
            
        except Exception as e:
            logger.error(f"{self.model_type.capitalize()} Scanner: Error initializing cache in background: {e}")
        finally:
            # Always clear the initializing flag when done
            self._is_initializing = False
    
    def _count_model_files(self) -> int:
        """Count all model files with supported extensions in all roots
        
        Returns:
            int: Total number of model files found
        """
        total_files = 0
        visited_real_paths = set()
        
        for root_path in self.get_model_roots():
            if not os.path.exists(root_path):
                continue
                
            def count_recursive(path):
                nonlocal total_files
                try:
                    real_path = os.path.realpath(path)
                    if real_path in visited_real_paths:
                        return
                    visited_real_paths.add(real_path)
                    
                    with os.scandir(path) as it:
                        for entry in it:
                            try:
                                if entry.is_file(follow_symlinks=True):
                                    ext = os.path.splitext(entry.name)[1].lower()
                                    if ext in self.file_extensions:
                                        total_files += 1
                                elif entry.is_dir(follow_symlinks=True):
                                    count_recursive(entry.path)
                            except Exception as e:
                                logger.error(f"Error counting files in entry {entry.path}: {e}")
                except Exception as e:
                    logger.error(f"Error counting files in {path}: {e}")
            
            count_recursive(root_path)
        
        return total_files
    
    def _initialize_cache_sync(self, total_files=0, page_type='loras'):
        """Synchronous version of cache initialization for thread pool execution"""
        try:
            # Create a new event loop for this thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            # Create a synchronous method to bypass the async lock
            def sync_initialize_cache():
                # Track progress
                processed_files = 0
                last_progress_time = time.time()
                last_progress_percent = 0
                
                # We need a wrapper around scan_all_models to track progress
                # This is a local function that will run in our thread's event loop
                async def scan_with_progress():
                    nonlocal processed_files, last_progress_time, last_progress_percent
                    
                    # For storing raw model data
                    all_models = []
                    
                    # Process each model root
                    for root_path in self.get_model_roots():
                        if not os.path.exists(root_path):
                            continue
                            
                        # Track visited paths to avoid symlink loops
                        visited_paths = set()
                        
                        # Recursively process directory
                        async def scan_dir_with_progress(path):
                            nonlocal processed_files, last_progress_time, last_progress_percent
                            
                            try:
                                real_path = os.path.realpath(path)
                                if real_path in visited_paths:
                                    return
                                visited_paths.add(real_path)
                                
                                with os.scandir(path) as it:
                                    entries = list(it)
                                    for entry in entries:
                                        try:
                                            if entry.is_file(follow_symlinks=True):
                                                ext = os.path.splitext(entry.name)[1].lower()
                                                if ext in self.file_extensions:
                                                    file_path = entry.path.replace(os.sep, "/")
                                                    result = await self._process_model_file(file_path, root_path)
                                                    if result:
                                                        all_models.append(result)
                                                    
                                                    # Update progress counter
                                                    processed_files += 1
                                                    
                                                    # Update progress periodically (not every file to avoid excessive updates)
                                                    current_time = time.time()
                                                    if total_files > 0 and (current_time - last_progress_time > 0.5 or processed_files == total_files):
                                                        # Adjusted progress calculation
                                                        progress_percent = min(99, int(1 + (processed_files / total_files) * 98))
                                                        if progress_percent > last_progress_percent:
                                                            last_progress_percent = progress_percent
                                                            last_progress_time = current_time
                                                            
                                                            # Send progress update through websocket
                                                            await ws_manager.broadcast_init_progress({
                                                                'stage': 'process_models',
                                                                'progress': progress_percent,
                                                                'details': f"Processing {self.model_type} files: {processed_files}/{total_files}",
                                                                'scanner_type': self.model_type,
                                                                'pageType': page_type
                                                            })
                                            
                                            elif entry.is_dir(follow_symlinks=True):
                                                await scan_dir_with_progress(entry.path)
                                                
                                        except Exception as e:
                                            logger.error(f"Error processing entry {entry.path}: {e}")
                            except Exception as e:
                                logger.error(f"Error scanning {path}: {e}")
                        
                        # Process the root path
                        await scan_dir_with_progress(root_path)
                    
                    return all_models
                
                # Run the progress-tracking scan function
                raw_data = loop.run_until_complete(scan_with_progress())
                
                # Update hash index and tags count
                for model_data in raw_data:
                    if 'sha256' in model_data and 'file_path' in model_data:
                        self._hash_index.add_entry(model_data['sha256'].lower(), model_data['file_path'])
                    
                    # Count tags
                    if 'tags' in model_data and model_data['tags']:
                        for tag in model_data['tags']:
                            self._tags_count[tag] = self._tags_count.get(tag, 0) + 1
                
                # Update cache
                self._cache.raw_data = raw_data
                loop.run_until_complete(self._cache.resort())
                
                return self._cache
            
            # Run our sync initialization that avoids lock conflicts
            return sync_initialize_cache()
        except Exception as e:
            logger.error(f"Error in thread-based {self.model_type} cache initialization: {e}")
        finally:
            # Clean up the event loop
            loop.close()

    async def get_cached_data(self, force_refresh: bool = False, rebuild_cache: bool = False) -> ModelCache:
        """Get cached model data, refresh if needed
        
        Args:
            force_refresh: Whether to refresh the cache
            rebuild_cache: Whether to completely rebuild the cache by reloading from disk first
        """
        # If cache is not initialized, return an empty cache
        # Actual initialization should be done via initialize_in_background
        if self._cache is None and not force_refresh:
            return ModelCache(
                raw_data=[],
                sorted_by_name=[],
                sorted_by_date=[],
                folders=[]
            )

        # If force refresh is requested, initialize the cache directly
        if force_refresh:
            # If rebuild_cache is True, try to reload from disk before reconciliation
            if rebuild_cache:
                logger.info(f"{self.model_type.capitalize()} Scanner: Attempting to rebuild cache from disk...")
                cache_loaded = await self._load_cache_from_disk()
                if cache_loaded:
                    logger.info(f"{self.model_type.capitalize()} Scanner: Successfully reloaded cache from disk")
                else:
                    logger.info(f"{self.model_type.capitalize()} Scanner: Could not reload cache from disk, proceeding with complete rebuild")
                    # If loading from disk failed, do a complete rebuild and save to disk
                    await self._initialize_cache()
                    await self._save_cache_to_disk()
                    return self._cache
            
            if self._cache is None:
                # For initial creation, do a full initialization
                await self._initialize_cache()
                # Save the newly built cache
                await self._save_cache_to_disk()
            else:
                # For subsequent refreshes, use fast reconciliation
                await self._reconcile_cache()
        
        return self._cache

    async def _initialize_cache(self) -> None:
        """Initialize or refresh the cache"""
        self._is_initializing = True  # Set flag
        try:
            start_time = time.time()
            # Clear existing hash index
            self._hash_index.clear()
            
            # Clear existing tags count
            self._tags_count = {}
            
            # Determine the page type based on model type
            page_type = 'loras' if self.model_type == 'lora' else 'checkpoints'
            
            # Scan for new data
            raw_data = await self.scan_all_models()
            
            # Build hash index and tags count
            for model_data in raw_data:
                if 'sha256' in model_data and 'file_path' in model_data:
                    self._hash_index.add_entry(model_data['sha256'].lower(), model_data['file_path'])
                
                # Count tags
                if 'tags' in model_data and model_data['tags']:
                    for tag in model_data['tags']:
                        self._tags_count[tag] = self._tags_count.get(tag, 0) + 1
            
            # Update cache
            self._cache = ModelCache(
                raw_data=raw_data,
                sorted_by_name=[],
                sorted_by_date=[],
                folders=[]
            )
            
            # Resort cache
            await self._cache.resort()

            logger.info(f"{self.model_type.capitalize()} Scanner: Cache initialization completed in {time.time() - start_time:.2f} seconds, found {len(raw_data)} models")
        except Exception as e:
            logger.error(f"{self.model_type.capitalize()} Scanner: Error initializing cache: {e}")
            # Ensure cache is at least an empty structure on error
            if self._cache is None:
                self._cache = ModelCache(
                    raw_data=[],
                    sorted_by_name=[],
                    sorted_by_date=[],
                    folders=[]
                )
        finally:
            self._is_initializing = False # Unset flag

    async def _reconcile_cache(self) -> None:
        """Fast cache reconciliation - only process differences between cache and filesystem"""
        self._is_initializing = True # Set flag for reconciliation duration
        try:
            start_time = time.time()
            logger.info(f"{self.model_type.capitalize()} Scanner: Starting fast cache reconciliation...")
            
            # Get current cached file paths
            cached_paths = {item['file_path'] for item in self._cache.raw_data}
            path_to_item = {item['file_path']: item for item in self._cache.raw_data}
            
            # Track found files and new files
            found_paths = set()
            new_files = []
            
            # Scan all model roots
            for root_path in self.get_model_roots():
                if not os.path.exists(root_path):
                    continue
                    
                # Track visited real paths to avoid symlink loops
                visited_real_paths = set()
                
                # Recursively scan directory
                for root, _, files in os.walk(root_path, followlinks=True):
                    real_root = os.path.realpath(root)
                    if real_root in visited_real_paths:
                        continue
                    visited_real_paths.add(real_root)
                    
                    for file in files:
                        ext = os.path.splitext(file)[1].lower()
                        if ext in self.file_extensions:
                            # Construct paths exactly as they would be in cache
                            file_path = os.path.join(root, file).replace(os.sep, '/')
                            
                            # Check if this file is already in cache
                            if file_path in cached_paths:
                                found_paths.add(file_path)
                                continue

                            if file_path in self._excluded_models:
                                continue
                                
                            # Try case-insensitive match on Windows
                            if os.name == 'nt':
                                lower_path = file_path.lower()
                                matched = False
                                for cached_path in cached_paths:
                                    if cached_path.lower() == lower_path:
                                        found_paths.add(cached_path)
                                        matched = True
                                        break
                                if matched:
                                    continue
                                
                            # This is a new file to process
                            new_files.append(file_path)
                    
                    # Yield control periodically
                    await asyncio.sleep(0)
            
            # Process new files in batches
            total_added = 0
            if new_files:
                logger.info(f"{self.model_type.capitalize()} Scanner: Found {len(new_files)} new files to process")
                batch_size = 50
                for i in range(0, len(new_files), batch_size):
                    batch = new_files[i:i+batch_size]
                    for path in batch:
                        try:
                            # Find the appropriate root path for this file
                            root_path = None
                            for potential_root in self.get_model_roots():
                                if path.startswith(potential_root):
                                    root_path = potential_root
                                    break
                            
                            if root_path:
                                model_data = await self._process_model_file(path, root_path)
                                if model_data:
                                    # Add to cache
                                    self._cache.raw_data.append(model_data)
                                    
                                    # Update hash index if available
                                    if 'sha256' in model_data and 'file_path' in model_data:
                                        self._hash_index.add_entry(model_data['sha256'].lower(), model_data['file_path'])
                                    
                                    # Update tags count
                                    if 'tags' in model_data and model_data['tags']:
                                        for tag in model_data['tags']:
                                            self._tags_count[tag] = self._tags_count.get(tag, 0) + 1
                                            
                                    total_added += 1
                            else:
                                logger.error(f"Could not determine root path for {path}")
                        except Exception as e:
                            logger.error(f"Error adding {path} to cache: {e}")
            
            # Find missing files (in cache but not in filesystem)
            missing_files = cached_paths - found_paths
            total_removed = 0
            
            if missing_files:
                logger.info(f"{self.model_type.capitalize()} Scanner: Found {len(missing_files)} files to remove from cache")
                
                # Process files to remove
                for path in missing_files:
                    try:
                        model_to_remove = path_to_item[path]
                        
                        # Update tags count
                        for tag in model_to_remove.get('tags', []):
                            if tag in self._tags_count:
                                self._tags_count[tag] = max(0, self._tags_count[tag] - 1)
                                if self._tags_count[tag] == 0:
                                    del self._tags_count[tag]
                        
                        # Remove from hash index
                        self._hash_index.remove_by_path(path)
                        total_removed += 1
                    except Exception as e:
                        logger.error(f"Error removing {path} from cache: {e}")
                
                # Update cache data
                self._cache.raw_data = [item for item in self._cache.raw_data if item['file_path'] not in missing_files]
            
            # Resort cache if changes were made
            if total_added > 0 or total_removed > 0:
                # Update folders list
                all_folders = set(item.get('folder', '') for item in self._cache.raw_data)
                self._cache.folders = sorted(list(all_folders), key=lambda x: x.lower())
                
                # Resort cache
                await self._cache.resort()
                
                # Save updated cache to disk
                await self._save_cache_to_disk()
                
            logger.info(f"{self.model_type.capitalize()} Scanner: Cache reconciliation completed in {time.time() - start_time:.2f} seconds. Added {total_added}, removed {total_removed} models.")
        except Exception as e:
            logger.error(f"{self.model_type.capitalize()} Scanner: Error reconciling cache: {e}", exc_info=True)
        finally:
            self._is_initializing = False # Unset flag

    # These methods should be implemented in child classes
    async def scan_all_models(self) -> List[Dict]:
        """Scan all model directories and return metadata"""
        raise NotImplementedError("Subclasses must implement scan_all_models")
    
    def is_initializing(self) -> bool:
        """Check if the scanner is currently initializing"""
        return self._is_initializing
    
    def get_model_roots(self) -> List[str]:
        """Get model root directories"""
        raise NotImplementedError("Subclasses must implement get_model_roots")
    
    async def _create_default_metadata(self, file_path: str) -> Optional[BaseModelMetadata]:
        """Get model file info and metadata (extensible for different model types)"""
        return await MetadataManager.create_default_metadata(file_path, self.model_class)
    
    def _calculate_folder(self, file_path: str) -> str:
        """Calculate the folder path for a model file"""
        for root in self.get_model_roots():
            if file_path.startswith(root):
                rel_path = os.path.relpath(file_path, root)
                return os.path.dirname(rel_path).replace(os.path.sep, '/')
        return ''

    # Common methods shared between scanners
    async def _process_model_file(self, file_path: str, root_path: str) -> Dict:
        """Process a single model file and return its metadata"""
        metadata = await MetadataManager.load_metadata(file_path, self.model_class)
        
        if metadata is None:
            civitai_info_path = f"{os.path.splitext(file_path)[0]}.civitai.info"
            if os.path.exists(civitai_info_path):
                try:
                    with open(civitai_info_path, 'r', encoding='utf-8') as f:
                        version_info = json.load(f)
                    
                    file_info = next((f for f in version_info.get('files', []) if f.get('primary')), None)
                    if file_info:
                        file_name = os.path.splitext(os.path.basename(file_path))[0]
                        file_info['name'] = file_name
                    
                        metadata = self.model_class.from_civitai_info(version_info, file_info, file_path)
                        metadata.preview_url = find_preview_file(file_name, os.path.dirname(file_path))
                        await MetadataManager.save_metadata(file_path, metadata, True)
                        logger.debug(f"Created metadata from .civitai.info for {file_path}")
                except Exception as e:
                    logger.error(f"Error creating metadata from .civitai.info for {file_path}: {e}")
        else:
            # Check if metadata exists but civitai field is empty - try to restore from civitai.info
            if metadata.civitai is None or metadata.civitai == {}:
                civitai_info_path = f"{os.path.splitext(file_path)[0]}.civitai.info"
                if os.path.exists(civitai_info_path):
                    try:
                        with open(civitai_info_path, 'r', encoding='utf-8') as f:
                            version_info = json.load(f)
                        
                        logger.debug(f"Restoring missing civitai data from .civitai.info for {file_path}")
                        metadata.civitai = version_info
                        
                        # Ensure tags are also updated if they're missing
                        if (not metadata.tags or len(metadata.tags) == 0) and 'model' in version_info:
                            if 'tags' in version_info['model']:
                                metadata.tags = version_info['model']['tags']
                        
                        # Also restore description if missing
                        if (not metadata.modelDescription or metadata.modelDescription == "") and 'model' in version_info:
                            if 'description' in version_info['model']:
                                metadata.modelDescription = version_info['model']['description']
                        
                        # Save the updated metadata
                        await MetadataManager.save_metadata(file_path, metadata, True)
                        logger.debug(f"Updated metadata with civitai info for {file_path}")
                    except Exception as e:
                        logger.error(f"Error restoring civitai data from .civitai.info for {file_path}: {e}")
            
        if metadata is None:
            metadata = await self._create_default_metadata(file_path)
        
        model_data = metadata.to_dict()
        
        # Skip excluded models
        if model_data.get('exclude', False):
            self._excluded_models.append(model_data['file_path'])
            return None
            
        await self._fetch_missing_metadata(file_path, model_data)
        rel_path = os.path.relpath(file_path, root_path)
        folder = os.path.dirname(rel_path)
        model_data['folder'] = folder.replace(os.path.sep, '/')
        
        return model_data

    async def _fetch_missing_metadata(self, file_path: str, model_data: Dict) -> None:
        """Fetch missing description and tags from Civitai if needed"""
        try:
            if model_data.get('civitai_deleted', False):
                logger.debug(f"Skipping metadata fetch for {file_path}: marked as deleted on Civitai")
                return

            needs_metadata_update = False
            model_id = None
            
            if model_data.get('civitai'):
                model_id = model_data['civitai'].get('modelId')
                
                if model_id:
                    model_id = str(model_id)
                    tags_missing = not model_data.get('tags') or len(model_data.get('tags', [])) == 0
                    desc_missing = not model_data.get('modelDescription') or model_data.get('modelDescription') in (None, "")
                    # TODO: not for now, but later we should check if the creator is missing
                    # creator_missing = not model_data.get('civitai', {}).get('creator')
                    creator_missing = False
                    needs_metadata_update = tags_missing or desc_missing or creator_missing
            
            if needs_metadata_update and model_id:
                logger.debug(f"Fetching missing metadata for {file_path} with model ID {model_id}")
                from ..services.civitai_client import CivitaiClient
                client = CivitaiClient()
                
                model_metadata, status_code = await client.get_model_metadata(model_id)
                await client.close()
                
                if status_code == 404:
                    logger.warning(f"Model {model_id} appears to be deleted from Civitai (404 response)")
                    model_data['civitai_deleted'] = True
                    
                    await MetadataManager.save_metadata(file_path, model_data)
                
                elif model_metadata:
                    logger.debug(f"Updating metadata for {file_path} with model ID {model_id}")
                    
                    if model_metadata.get('tags') and (not model_data.get('tags') or len(model_data.get('tags', [])) == 0):
                        model_data['tags'] = model_metadata['tags']
                    
                    if model_metadata.get('description') and (not model_data.get('modelDescription') or model_data.get('modelDescription') in (None, "")):
                        model_data['modelDescription'] = model_metadata['description']

                    model_data['civitai']['creator'] = model_metadata['creator']
                    
                    await MetadataManager.save_metadata(file_path, model_data, True)
        except Exception as e:
            logger.error(f"Failed to update metadata from Civitai for {file_path}: {e}")

    async def _scan_directory(self, root_path: str) -> List[Dict]:
        """Base implementation for directory scanning"""
        models = []
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
                                ext = os.path.splitext(entry.name)[1].lower()
                                if ext in self.file_extensions:
                                    file_path = entry.path.replace(os.sep, "/")
                                    await self._process_single_file(file_path, original_root, models)
                                    await asyncio.sleep(0)
                            elif entry.is_dir(follow_symlinks=True):
                                await scan_recursive(entry.path, visited_paths)
                        except Exception as e:
                            logger.error(f"Error processing entry {entry.path}: {e}")
            except Exception as e:
                logger.error(f"Error scanning {path}: {e}")
        
        await scan_recursive(root_path, set())
        return models

    async def _process_single_file(self, file_path: str, root_path: str, models_list: list):
        """Process a single file and add to results list"""
        try:
            result = await self._process_model_file(file_path, root_path)
            if result:
                models_list.append(result)
        except Exception as e:
            logger.error(f"Error processing {file_path}: {e}")

    async def add_model_to_cache(self, metadata_dict: Dict, folder: str = '') -> bool:
        """Add a model to the cache and save to disk
        
        Args:
            metadata_dict: The model metadata dictionary
            folder: The relative folder path for the model
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            if self._cache is None:
                await self.get_cached_data()
                
            # Update folder in metadata
            metadata_dict['folder'] = folder
            
            # Add to cache
            self._cache.raw_data.append(metadata_dict)
            
            # Resort cache data
            await self._cache.resort()
            
            # Update folders list
            all_folders = set(self._cache.folders)
            all_folders.add(folder)
            self._cache.folders = sorted(list(all_folders), key=lambda x: x.lower())
            
            # Update the hash index
            self._hash_index.add_entry(metadata_dict['sha256'], metadata_dict['file_path'])
                
            # Save to disk
            await self._save_cache_to_disk()
            return True
        except Exception as e:
            logger.error(f"Error adding model to cache: {e}")
            return False
    
    async def move_model(self, source_path: str, target_path: str) -> bool:
        """Move a model and its associated files to a new location"""
        try:
            source_path = source_path.replace(os.sep, '/')
            target_path = target_path.replace(os.sep, '/')
            
            file_ext = os.path.splitext(source_path)[1]
            
            if not file_ext or file_ext.lower() not in self.file_extensions:
                logger.error(f"Invalid file extension for model: {file_ext}")
                return False
                
            base_name = os.path.splitext(os.path.basename(source_path))[0]
            source_dir = os.path.dirname(source_path)
            
            os.makedirs(target_path, exist_ok=True)
            
            target_file = os.path.join(target_path, f"{base_name}{file_ext}").replace(os.sep, '/')

            real_source = os.path.realpath(source_path)
            real_target = os.path.realpath(target_file)
            
            shutil.move(real_source, real_target)
            
            # Move all associated files with the same base name
            source_metadata = None
            moved_metadata_path = None
            
            # Find all files with the same base name in the source directory
            files_to_move = []
            try:
                for file in os.listdir(source_dir):
                    if file.startswith(base_name + ".") and file != os.path.basename(source_path):
                        source_file_path = os.path.join(source_dir, file)
                        # Store metadata file path for special handling
                        if file == f"{base_name}.metadata.json":
                            source_metadata = source_file_path
                            moved_metadata_path = os.path.join(target_path, file)
                        else:
                            files_to_move.append((source_file_path, os.path.join(target_path, file)))
            except Exception as e:
                logger.error(f"Error listing files in {source_dir}: {e}")
            
            # Move all associated files
            metadata = None
            for source_file, target_file_path in files_to_move:
                try:
                    shutil.move(source_file, target_file_path)
                except Exception as e:
                    logger.error(f"Error moving associated file {source_file}: {e}")
            
            # Handle metadata file specially to update paths
            if source_metadata and os.path.exists(source_metadata):
                try:
                    shutil.move(source_metadata, moved_metadata_path)
                    metadata = await self._update_metadata_paths(moved_metadata_path, target_file)
                except Exception as e:
                    logger.error(f"Error moving metadata file: {e}")
            
            await self.update_single_model_cache(source_path, target_file, metadata)
            
            return True
            
        except Exception as e:
            logger.error(f"Error moving model: {e}", exc_info=True)
            return False
    
    async def _update_metadata_paths(self, metadata_path: str, model_path: str) -> Dict:
        """Update file paths in metadata file"""
        try:
            with open(metadata_path, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
            
            metadata['file_path'] = model_path.replace(os.sep, '/')
            
            if 'preview_url' in metadata and metadata['preview_url']:
                preview_dir = os.path.dirname(model_path)
                preview_name = os.path.splitext(os.path.basename(metadata['preview_url']))[0]
                preview_ext = os.path.splitext(metadata['preview_url'])[1]
                new_preview_path = os.path.join(preview_dir, f"{preview_name}{preview_ext}")
                metadata['preview_url'] = new_preview_path.replace(os.sep, '/')
            
            await MetadataManager.save_metadata(metadata_path, metadata)

            return metadata
                
        except Exception as e:
            logger.error(f"Error updating metadata paths: {e}", exc_info=True)
            return None

    async def update_single_model_cache(self, original_path: str, new_path: str, metadata: Dict) -> bool:
        """Update cache after a model has been moved or modified"""
        cache = await self.get_cached_data()
        
        existing_item = next((item for item in cache.raw_data if item['file_path'] == original_path), None)
        if existing_item and 'tags' in existing_item:
            for tag in existing_item.get('tags', []):
                if tag in self._tags_count:
                    self._tags_count[tag] = max(0, self._tags_count[tag] - 1)
                    if self._tags_count[tag] == 0:
                        del self._tags_count[tag]
        
        self._hash_index.remove_by_path(original_path)
        
        cache.raw_data = [
            item for item in cache.raw_data 
            if item['file_path'] != original_path
        ]
        
        if metadata:
            if original_path == new_path:
                existing_folder = next((item['folder'] for item in cache.raw_data 
                                      if item['file_path'] == original_path), None)
                if existing_folder:
                    metadata['folder'] = existing_folder
                else:
                    metadata['folder'] = self._calculate_folder(new_path)
            else:
                metadata['folder'] = self._calculate_folder(new_path)
            
            cache.raw_data.append(metadata)
            
            if 'sha256' in metadata:
                self._hash_index.add_entry(metadata['sha256'].lower(), new_path)
            
            all_folders = set(item['folder'] for item in cache.raw_data)
            cache.folders = sorted(list(all_folders), key=lambda x: x.lower())
            
            if 'tags' in metadata:
                for tag in metadata.get('tags', []):
                    self._tags_count[tag] = self._tags_count.get(tag, 0) + 1
        
        await cache.resort()
        
        # Save the updated cache
        await self._save_cache_to_disk()
        
        return True
        
    def has_hash(self, sha256: str) -> bool:
        """Check if a model with given hash exists"""
        return self._hash_index.has_hash(sha256.lower())
        
    def get_path_by_hash(self, sha256: str) -> Optional[str]:
        """Get file path for a model by its hash"""
        return self._hash_index.get_path(sha256.lower())
        
    def get_hash_by_path(self, file_path: str) -> Optional[str]:
        """Get hash for a model by its file path"""
        return self._hash_index.get_hash(file_path)
        
    def get_hash_by_filename(self, filename: str) -> Optional[str]:
        """Get hash for a model by its filename without path"""
        return self._hash_index.get_hash_by_filename(filename)

    # TODO: Adjust this method to use metadata instead of finding the file    
    def get_preview_url_by_hash(self, sha256: str) -> Optional[str]:
        """Get preview static URL for a model by its hash"""
        file_path = self._hash_index.get_path(sha256.lower())
        if not file_path:
            return None
            
        base_name = os.path.splitext(file_path)[0]
        
        for ext in PREVIEW_EXTENSIONS:
            preview_path = f"{base_name}{ext}"
            if os.path.exists(preview_path):
                return config.get_preview_static_url(preview_path)
        
        return None
        
    async def get_top_tags(self, limit: int = 20) -> List[Dict[str, any]]:
        """Get top tags sorted by count"""
        await self.get_cached_data()
        
        sorted_tags = sorted(
            [{"tag": tag, "count": count} for tag, count in self._tags_count.items()],
            key=lambda x: x['count'],
            reverse=True
        )
        
        return sorted_tags[:limit]
        
    async def get_base_models(self, limit: int = 20) -> List[Dict[str, any]]:
        """Get base models sorted by frequency"""
        cache = await self.get_cached_data()
        
        base_model_counts = {}
        for model in cache.raw_data:
            if 'base_model' in model and model['base_model']:
                base_model = model['base_model']
                base_model_counts[base_model] = base_model_counts.get(base_model, 0) + 1
        
        sorted_models = [{'name': model, 'count': count} for model, count in base_model_counts.items()]
        sorted_models.sort(key=lambda x: x['count'], reverse=True)
        
        return sorted_models[:limit]
        
    async def get_model_info_by_name(self, name):
        """Get model information by name"""
        try:
            cache = await self.get_cached_data()
            
            for model in cache.raw_data:
                if model.get("file_name") == name:
                    return model
                    
            return None
        except Exception as e:
            logger.error(f"Error getting model info by name: {e}", exc_info=True)
            return None
        
    def get_excluded_models(self) -> List[str]:
        """Get list of excluded model file paths"""
        return self._excluded_models.copy()

    async def update_preview_in_cache(self, file_path: str, preview_url: str, preview_nsfw_level: int) -> bool:
        """Update preview URL in cache for a specific lora
        
        Args:
            file_path: The file path of the lora to update
            preview_url: The new preview URL
            preview_nsfw_level: The NSFW level of the preview
            
        Returns:
            bool: True if the update was successful, False if cache doesn't exist or lora wasn't found
        """
        if self._cache is None:
            return False

        updated = await self._cache.update_preview_url(file_path, preview_url, preview_nsfw_level)
        if updated:
            # Save updated cache to disk
            await self._save_cache_to_disk()
        return updated

    async def bulk_delete_models(self, file_paths: List[str]) -> Dict:
        """Delete multiple models and update cache in a batch operation
        
        Args:
            file_paths: List of file paths to delete
            
        Returns:
            Dict containing results of the operation
        """
        try:
            if not file_paths:
                return {
                    'success': False,
                    'error': 'No file paths provided for deletion',
                    'results': []
                }
            
            # Keep track of success and failures
            results = []
            total_deleted = 0
            cache_updated = False
            
            # Get cache data
            cache = await self.get_cached_data()
            
            # Track deleted models to update cache once
            deleted_models = []
            
            for file_path in file_paths:
                try:
                    target_dir = os.path.dirname(file_path)
                    file_name = os.path.splitext(os.path.basename(file_path))[0]
                    
                    # Delete all associated files for the model
                    from ..utils.routes_common import ModelRouteUtils
                    deleted_files = await ModelRouteUtils.delete_model_files(
                        target_dir, 
                        file_name
                    )
                    
                    if deleted_files:
                        deleted_models.append(file_path)
                        results.append({
                            'file_path': file_path,
                            'success': True,
                            'deleted_files': deleted_files
                        })
                        total_deleted += 1
                    else:
                        results.append({
                            'file_path': file_path,
                            'success': False,
                            'error': 'No files deleted'
                        })
                except Exception as e:
                    logger.error(f"Error deleting file {file_path}: {e}")
                    results.append({
                        'file_path': file_path,
                        'success': False,
                        'error': str(e)
                    })
            
            # Batch update cache if any models were deleted
            if deleted_models:
                # Update the cache in a batch operation
                cache_updated = await self._batch_update_cache_for_deleted_models(deleted_models)
                
            return {
                'success': True,
                'total_deleted': total_deleted,
                'total_attempted': len(file_paths),
                'cache_updated': cache_updated,
                'results': results
            }
            
        except Exception as e:
            logger.error(f"Error in bulk delete: {e}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'results': []
            }
    
    async def _batch_update_cache_for_deleted_models(self, file_paths: List[str]) -> bool:
        """Update cache after multiple models have been deleted
        
        Args:
            file_paths: List of file paths that were deleted
            
        Returns:
            bool: True if cache was updated and saved successfully
        """
        if not file_paths or self._cache is None:
            return False
            
        try:
            # Get all models that need to be removed from cache
            models_to_remove = [item for item in self._cache.raw_data if item['file_path'] in file_paths]
            
            if not models_to_remove:
                return False
                
            # Update tag counts
            for model in models_to_remove:
                for tag in model.get('tags', []):
                    if tag in self._tags_count:
                        self._tags_count[tag] = max(0, self._tags_count[tag] - 1)
                        if self._tags_count[tag] == 0:
                            del self._tags_count[tag]
            
            # Update hash index
            for model in models_to_remove:
                file_path = model['file_path']
                if hasattr(self, '_hash_index') and self._hash_index:
                    # Get the hash and filename before removal for duplicate checking
                    file_name = os.path.splitext(os.path.basename(file_path))[0]
                    hash_val = model.get('sha256', '').lower()
                    
                    # Remove from hash index
                    self._hash_index.remove_by_path(file_path, hash_val)
                    
                    # Check and clean up duplicates
                    self._cleanup_duplicates_after_removal(hash_val, file_name)
            
            # Update cache data
            self._cache.raw_data = [item for item in self._cache.raw_data if item['file_path'] not in file_paths]
            
            # Resort cache
            await self._cache.resort()
            
            # Save updated cache to disk
            await self._save_cache_to_disk()
            
            return True
            
        except Exception as e:
            logger.error(f"Error updating cache after bulk delete: {e}", exc_info=True)
            return False
    
    def _cleanup_duplicates_after_removal(self, hash_val: str, file_name: str) -> None:
        """Clean up duplicate entries in hash index after removing a model
        
        Args:
            hash_val: SHA256 hash of the removed model
            file_name: File name of the removed model without extension
        """
        if not hash_val or not file_name or not hasattr(self, '_hash_index'):
            return
            
        # Clean up hash duplicates if only 0 or 1 entries remain
        if hash_val in self._hash_index._duplicate_hashes:
            if len(self._hash_index._duplicate_hashes[hash_val]) <= 1:
                del self._hash_index._duplicate_hashes[hash_val]
        
        # Clean up filename duplicates if only 0 or 1 entries remain
        if file_name in self._hash_index._duplicate_filenames:
            if len(self._hash_index._duplicate_filenames[file_name]) <= 1:
                del self._hash_index._duplicate_filenames[file_name]
