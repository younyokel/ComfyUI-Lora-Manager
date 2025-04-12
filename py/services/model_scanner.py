import json
import os
import logging
import asyncio
import time
import shutil
from typing import List, Dict, Optional, Type, Set

from ..utils.models import BaseModelMetadata
from ..config import config
from ..utils.file_utils import load_metadata, get_file_info, find_preview_file, save_metadata
from .model_cache import ModelCache
from .model_hash_index import ModelHashIndex
from ..utils.constants import PREVIEW_EXTENSIONS
from .service_registry import ServiceRegistry

logger = logging.getLogger(__name__)

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
        
        # Register this service
        asyncio.create_task(self._register_service())
        
    async def _register_service(self):
        """Register this instance with the ServiceRegistry"""
        service_name = f"{self.model_type}_scanner"
        await ServiceRegistry.register_service(service_name, self)
    
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
            
            start_time = time.time()
            # Use thread pool to execute CPU-intensive operations
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,  # Use default thread pool
                self._initialize_cache_sync  # Run synchronous version in thread
            )
            logger.info(f"{self.model_type.capitalize()} cache initialized in {time.time() - start_time:.2f} seconds. Found {len(self._cache.raw_data)} models")
        except Exception as e:
            logger.error(f"{self.model_type.capitalize()} Scanner: Error initializing cache in background: {e}")
        finally:
            # Always clear the initializing flag when done
            self._is_initializing = False
    
    def _initialize_cache_sync(self):
        """Synchronous version of cache initialization for thread pool execution"""
        try:
            # Create a new event loop for this thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            # Create a synchronous method to bypass the async lock
            def sync_initialize_cache():
                # Directly call the scan method to avoid lock issues
                raw_data = loop.run_until_complete(self.scan_all_models())
                
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

    async def get_cached_data(self, force_refresh: bool = False) -> ModelCache:
        """Get cached model data, refresh if needed"""
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
            if self._cache is None:
                # For initial creation, do a full initialization
                await self._initialize_cache()
            else:
                # For subsequent refreshes, use fast reconciliation
                await self._reconcile_cache()
        
        return self._cache

    async def _initialize_cache(self) -> None:
        """Initialize or refresh the cache"""
        try:
            start_time = time.time()
            # Clear existing hash index
            self._hash_index.clear()
            
            # Clear existing tags count
            self._tags_count = {}
            
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
            self._cache = ModelCache(
                raw_data=[],
                sorted_by_name=[],
                sorted_by_date=[],
                folders=[]
            )

    async def _reconcile_cache(self) -> None:
        """Fast cache reconciliation - only process differences between cache and filesystem"""
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
                            model_data = await self.scan_single_model(path)
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
                        except Exception as e:
                            logger.error(f"Error adding {path} to cache: {e}")
                    
                    # Yield control after each batch
                    await asyncio.sleep(0)
            
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
                
            logger.info(f"{self.model_type.capitalize()} Scanner: Cache reconciliation completed in {time.time() - start_time:.2f} seconds. Added {total_added}, removed {total_removed} models.")
        except Exception as e:
            logger.error(f"{self.model_type.capitalize()} Scanner: Error reconciling cache: {e}", exc_info=True)

    # These methods should be implemented in child classes
    async def scan_all_models(self) -> List[Dict]:
        """Scan all model directories and return metadata"""
        raise NotImplementedError("Subclasses must implement scan_all_models")
    
    def get_model_roots(self) -> List[str]:
        """Get model root directories"""
        raise NotImplementedError("Subclasses must implement get_model_roots")

    async def scan_single_model(self, file_path: str) -> Optional[Dict]:
        """Scan a single model file and return its metadata"""
        try:
            if not os.path.exists(os.path.realpath(file_path)):
                return None
                
            # Get basic file info
            metadata = await self._get_file_info(file_path)
            if not metadata:
                return None
                
            folder = self._calculate_folder(file_path)
                    
            # Ensure folder field exists
            metadata_dict = metadata.to_dict()
            metadata_dict['folder'] = folder or ''
            
            return metadata_dict
            
        except Exception as e:
            logger.error(f"Error scanning {file_path}: {e}")
            return None
    
    async def _get_file_info(self, file_path: str) -> Optional[BaseModelMetadata]:
        """Get model file info and metadata (extensible for different model types)"""
        return await get_file_info(file_path, self.model_class)
    
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
        metadata = await load_metadata(file_path, self.model_class)
        
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
                        await save_metadata(file_path, metadata)
                        logger.debug(f"Created metadata from .civitai.info for {file_path}")
                except Exception as e:
                    logger.error(f"Error creating metadata from .civitai.info for {file_path}: {e}")
            
            if metadata is None:
                metadata = await self._get_file_info(file_path)
        
        model_data = metadata.to_dict()
        
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
                    needs_metadata_update = tags_missing or desc_missing
            
            if needs_metadata_update and model_id:
                logger.debug(f"Fetching missing metadata for {file_path} with model ID {model_id}")
                from ..services.civitai_client import CivitaiClient
                client = CivitaiClient()
                
                model_metadata, status_code = await client.get_model_metadata(model_id)
                await client.close()
                
                if status_code == 404:
                    logger.warning(f"Model {model_id} appears to be deleted from Civitai (404 response)")
                    model_data['civitai_deleted'] = True
                    
                    metadata_path = os.path.splitext(file_path)[0] + '.metadata.json'
                    with open(metadata_path, 'w', encoding='utf-8') as f:
                        json.dump(model_data, f, indent=2, ensure_ascii=False)
                
                elif model_metadata:
                    logger.debug(f"Updating metadata for {file_path} with model ID {model_id}")
                    
                    if model_metadata.get('tags') and (not model_data.get('tags') or len(model_data.get('tags', [])) == 0):
                        model_data['tags'] = model_metadata['tags']
                    
                    if model_metadata.get('description') and (not model_data.get('modelDescription') or model_data.get('modelDescription') in (None, "")):
                        model_data['modelDescription'] = model_metadata['description']
                    
                    metadata_path = os.path.splitext(file_path)[0] + '.metadata.json'
                    with open(metadata_path, 'w', encoding='utf-8') as f:
                        json.dump(model_data, f, indent=2, ensure_ascii=False)
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
            
            file_size = os.path.getsize(real_source)
            
            # Get the appropriate file monitor through ServiceRegistry
            if self.model_type == "lora":
                monitor = await ServiceRegistry.get_lora_monitor()
            elif self.model_type == "checkpoint":
                monitor = await ServiceRegistry.get_checkpoint_monitor()
            else:
                monitor = None
                
            if monitor:
                monitor.handler.add_ignore_path(
                    real_source,
                    file_size
                )
                monitor.handler.add_ignore_path(
                    real_target,
                    file_size
                )
            
            shutil.move(real_source, real_target)
            
            source_metadata = os.path.join(source_dir, f"{base_name}.metadata.json")
            metadata = None
            if os.path.exists(source_metadata):
                target_metadata = os.path.join(target_path, f"{base_name}.metadata.json")
                shutil.move(source_metadata, target_metadata)
                metadata = await self._update_metadata_paths(target_metadata, target_file)
            
            for ext in PREVIEW_EXTENSIONS:
                source_preview = os.path.join(source_dir, f"{base_name}{ext}")
                if os.path.exists(source_preview):
                    target_preview = os.path.join(target_path, f"{base_name}{ext}")
                    shutil.move(source_preview, target_preview)
                    break
            
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
            
            if 'preview_url' in metadata:
                preview_dir = os.path.dirname(model_path)
                preview_name = os.path.splitext(os.path.basename(metadata['preview_url']))[0]
                preview_ext = os.path.splitext(metadata['preview_url'])[1]
                new_preview_path = os.path.join(preview_dir, f"{preview_name}{preview_ext}")
                metadata['preview_url'] = new_preview_path.replace(os.sep, '/')
            
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)

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
        
    async def update_preview_in_cache(self, file_path: str, preview_url: str) -> bool:
        """Update preview URL in cache for a specific lora
        
        Args:
            file_path: The file path of the lora to update
            preview_url: The new preview URL
            
        Returns:
            bool: True if the update was successful, False if cache doesn't exist or lora wasn't found
        """
        if self._cache is None:
            return False

        return await self._cache.update_preview_url(file_path, preview_url)