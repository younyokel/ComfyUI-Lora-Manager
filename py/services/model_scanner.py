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

logger = logging.getLogger(__name__)

class ModelScanner:
    """Base service for scanning and managing model files"""
    
    _instance = None
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
        self._initialization_lock = asyncio.Lock()
        self._initialization_task = None
        self.file_monitor = None
        self._tags_count = {}  # Dictionary to store tag counts
    
    def set_file_monitor(self, monitor):
        """Set file monitor instance"""
        self.file_monitor = monitor

    async def get_cached_data(self, force_refresh: bool = False) -> ModelCache:
        """Get cached model data, refresh if needed"""
        async with self._initialization_lock:
            # Return empty cache if not initialized and no refresh requested
            if self._cache is None and not force_refresh:
                return ModelCache(
                    raw_data=[],
                    sorted_by_name=[],
                    sorted_by_date=[],
                    folders=[]
                )

            # Wait for ongoing initialization if any
            if self._initialization_task and not self._initialization_task.done():
                try:
                    await self._initialization_task
                except Exception as e:
                    logger.error(f"Cache initialization failed: {e}")
                    self._initialization_task = None
            
            if (self._cache is None or force_refresh):
                # Create new initialization task
                if not self._initialization_task or self._initialization_task.done():
                    self._initialization_task = asyncio.create_task(self._initialize_cache())
                
                try:
                    await self._initialization_task
                except Exception as e:
                    logger.error(f"Cache initialization failed: {e}")
                    # Continue using old cache if it exists
                    if self._cache is None:
                        raise  # Raise exception if no cache available
            
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

            self._initialization_task = None
            logger.info(f"{self.model_type.capitalize()} Scanner: Cache initialization completed in {time.time() - start_time:.2f} seconds, found {len(raw_data)} models")
        except Exception as e:
            logger.error(f"{self.model_type.capitalize()} Scanner: Error initializing cache: {e}")
            self._cache = ModelCache(
                raw_data=[],
                sorted_by_name=[],
                sorted_by_date=[],
                folders=[]
            )

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
        # Implementation may vary by model type - override in subclasses if needed
        return await get_file_info(file_path, self.model_class)
    
    def _calculate_folder(self, file_path: str) -> str:
        """Calculate the folder path for a model file"""
        # Use original path to calculate relative path
        for root in self.get_model_roots():
            if file_path.startswith(root):
                rel_path = os.path.relpath(file_path, root)
                return os.path.dirname(rel_path).replace(os.path.sep, '/')
        return ''

    # Common methods shared between scanners
    async def _process_model_file(self, file_path: str, root_path: str) -> Dict:
        """Process a single model file and return its metadata"""
        # Try loading existing metadata
        metadata = await load_metadata(file_path, self.model_class)
        
        if metadata is None:
            # Try to find and use .civitai.info file first
            civitai_info_path = f"{os.path.splitext(file_path)[0]}.civitai.info"
            if os.path.exists(civitai_info_path):
                try:
                    with open(civitai_info_path, 'r', encoding='utf-8') as f:
                        version_info = json.load(f)
                    
                    file_info = next((f for f in version_info.get('files', []) if f.get('primary')), None)
                    if file_info:
                        # Create a minimal file_info with the required fields
                        file_name = os.path.splitext(os.path.basename(file_path))[0]
                        file_info['name'] = file_name
                    
                        # Use from_civitai_info to create metadata
                        metadata = self.model_class.from_civitai_info(version_info, file_info, file_path)
                        metadata.preview_url = find_preview_file(file_name, os.path.dirname(file_path))
                        await save_metadata(file_path, metadata)
                        logger.debug(f"Created metadata from .civitai.info for {file_path}")
                except Exception as e:
                    logger.error(f"Error creating metadata from .civitai.info for {file_path}: {e}")
            
            # If still no metadata, create new metadata
            if metadata is None:
                metadata = await self._get_file_info(file_path)
        
        # Convert to dict and add folder info
        model_data = metadata.to_dict()
        
        # Try to fetch missing metadata from Civitai if needed
        await self._fetch_missing_metadata(file_path, model_data)
        rel_path = os.path.relpath(file_path, root_path)
        folder = os.path.dirname(rel_path)
        model_data['folder'] = folder.replace(os.path.sep, '/')
        
        return model_data

    async def _fetch_missing_metadata(self, file_path: str, model_data: Dict) -> None:
        """Fetch missing description and tags from Civitai if needed"""
        try:
            # Skip if already marked as deleted on Civitai
            if model_data.get('civitai_deleted', False):
                logger.debug(f"Skipping metadata fetch for {file_path}: marked as deleted on Civitai")
                return

            # Check if we need to fetch additional metadata from Civitai
            needs_metadata_update = False
            model_id = None
            
            # Check if we have Civitai model ID but missing metadata
            if model_data.get('civitai'):
                model_id = model_data['civitai'].get('modelId')
                
                if model_id:
                    model_id = str(model_id)
                    # Check if tags or description are missing
                    tags_missing = not model_data.get('tags') or len(model_data.get('tags', [])) == 0
                    desc_missing = not model_data.get('modelDescription') or model_data.get('modelDescription') in (None, "")
                    needs_metadata_update = tags_missing or desc_missing
            
            # Fetch missing metadata if needed
            if needs_metadata_update and model_id:
                logger.debug(f"Fetching missing metadata for {file_path} with model ID {model_id}")
                from ..services.civitai_client import CivitaiClient
                client = CivitaiClient()
                
                # Get metadata and status code
                model_metadata, status_code = await client.get_model_metadata(model_id)
                await client.close()
                
                # Handle 404 status (model deleted from Civitai)
                if status_code == 404:
                    logger.warning(f"Model {model_id} appears to be deleted from Civitai (404 response)")
                    model_data['civitai_deleted'] = True
                    
                    # Save the updated metadata
                    metadata_path = os.path.splitext(file_path)[0] + '.metadata.json'
                    with open(metadata_path, 'w', encoding='utf-8') as f:
                        json.dump(model_data, f, indent=2, ensure_ascii=False)
                
                # Process valid metadata if available
                elif model_metadata:
                    logger.debug(f"Updating metadata for {file_path} with model ID {model_id}")
                    
                    # Update tags if they were missing
                    if model_metadata.get('tags') and (not model_data.get('tags') or len(model_data.get('tags', [])) == 0):
                        model_data['tags'] = model_metadata['tags']
                    
                    # Update description if it was missing
                    if model_metadata.get('description') and (not model_data.get('modelDescription') or model_data.get('modelDescription') in (None, "")):
                        model_data['modelDescription'] = model_metadata['description']
                    
                    # Save the updated metadata
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
                                # Check if file has supported extension
                                ext = os.path.splitext(entry.name)[1].lower()
                                if ext in self.file_extensions:
                                    file_path = entry.path.replace(os.sep, "/")
                                    await self._process_single_file(file_path, original_root, models)
                                    await asyncio.sleep(0)
                            elif entry.is_dir(follow_symlinks=True):
                                # For directories, continue scanning with original path
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
            # Keep original path format
            source_path = source_path.replace(os.sep, '/')
            target_path = target_path.replace(os.sep, '/')
            
            # Get file extension from source
            file_ext = os.path.splitext(source_path)[1]
            
            # If no extension or not in supported extensions, return False
            if not file_ext or file_ext.lower() not in self.file_extensions:
                logger.error(f"Invalid file extension for model: {file_ext}")
                return False
                
            base_name = os.path.splitext(os.path.basename(source_path))[0]
            source_dir = os.path.dirname(source_path)
            
            os.makedirs(target_path, exist_ok=True)
            
            target_file = os.path.join(target_path, f"{base_name}{file_ext}").replace(os.sep, '/')

            # Use real paths for file operations
            real_source = os.path.realpath(source_path)
            real_target = os.path.realpath(target_file)
            
            file_size = os.path.getsize(real_source)
            
            if self.file_monitor:
                self.file_monitor.handler.add_ignore_path(
                    real_source,
                    file_size
                )
                self.file_monitor.handler.add_ignore_path(
                    real_target,
                    file_size
                )
            
            # Use real paths for file operations
            shutil.move(real_source, real_target)
            
            # Move associated files
            source_metadata = os.path.join(source_dir, f"{base_name}.metadata.json")
            metadata = None
            if os.path.exists(source_metadata):
                target_metadata = os.path.join(target_path, f"{base_name}.metadata.json")
                shutil.move(source_metadata, target_metadata)
                metadata = await self._update_metadata_paths(target_metadata, target_file)
            
            # Move preview file if exists
            preview_extensions = ['.preview.png', '.preview.jpeg', '.preview.jpg', '.preview.mp4',
                               '.png', '.jpeg', '.jpg', '.mp4']
            for ext in preview_extensions:
                source_preview = os.path.join(source_dir, f"{base_name}{ext}")
                if os.path.exists(source_preview):
                    target_preview = os.path.join(target_path, f"{base_name}{ext}")
                    shutil.move(source_preview, target_preview)
                    break
            
            # Update cache
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
            
            # Update file_path
            metadata['file_path'] = model_path.replace(os.sep, '/')
            
            # Update preview_url if exists
            if 'preview_url' in metadata:
                preview_dir = os.path.dirname(model_path)
                preview_name = os.path.splitext(os.path.basename(metadata['preview_url']))[0]
                preview_ext = os.path.splitext(metadata['preview_url'])[1]
                new_preview_path = os.path.join(preview_dir, f"{preview_name}{preview_ext}")
                metadata['preview_url'] = new_preview_path.replace(os.sep, '/')
            
            # Save updated metadata
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)

            return metadata
                
        except Exception as e:
            logger.error(f"Error updating metadata paths: {e}", exc_info=True)
            return None

    async def update_single_model_cache(self, original_path: str, new_path: str, metadata: Dict) -> bool:
        """Update cache after a model has been moved or modified"""
        cache = await self.get_cached_data()
        
        # Find the existing item to remove its tags from count
        existing_item = next((item for item in cache.raw_data if item['file_path'] == original_path), None)
        if existing_item and 'tags' in existing_item:
            for tag in existing_item.get('tags', []):
                if tag in self._tags_count:
                    self._tags_count[tag] = max(0, self._tags_count[tag] - 1)
                    if self._tags_count[tag] == 0:
                        del self._tags_count[tag]
        
        # Remove old path from hash index if exists
        self._hash_index.remove_by_path(original_path)
        
        # Remove the old entry from raw_data
        cache.raw_data = [
            item for item in cache.raw_data 
            if item['file_path'] != original_path
        ]
        
        if metadata:
            # If this is an update to an existing path (not a move), ensure folder is preserved
            if original_path == new_path:
                # Find the folder from existing entries or calculate it
                existing_folder = next((item['folder'] for item in cache.raw_data 
                                      if item['file_path'] == original_path), None)
                if existing_folder:
                    metadata['folder'] = existing_folder
                else:
                    metadata['folder'] = self._calculate_folder(new_path)
            else:
                # For moved files, recalculate the folder
                metadata['folder'] = self._calculate_folder(new_path)
            
            # Add the updated metadata to raw_data
            cache.raw_data.append(metadata)
            
            # Update hash index with new path
            if 'sha256' in metadata:
                self._hash_index.add_entry(metadata['sha256'].lower(), new_path)
            
            # Update folders list
            all_folders = set(item['folder'] for item in cache.raw_data)
            cache.folders = sorted(list(all_folders), key=lambda x: x.lower())
            
            # Update tags count with the new/updated tags
            if 'tags' in metadata:
                for tag in metadata.get('tags', []):
                    self._tags_count[tag] = self._tags_count.get(tag, 0) + 1
        
        # Resort cache
        await cache.resort()
        
        return True
        
    # Hash index functionality (common for all model types)
    def has_hash(self, sha256: str) -> bool:
        """Check if a model with given hash exists"""
        return self._hash_index.has_hash(sha256.lower())
        
    def get_path_by_hash(self, sha256: str) -> Optional[str]:
        """Get file path for a model by its hash"""
        return self._hash_index.get_path(sha256.lower())
        
    def get_hash_by_path(self, file_path: str) -> Optional[str]:
        """Get hash for a model by its file path"""
        return self._hash_index.get_hash(file_path)
        
    def get_preview_url_by_hash(self, sha256: str) -> Optional[str]:
        """Get preview static URL for a model by its hash"""
        # Get the file path first
        file_path = self._hash_index.get_path(sha256.lower())
        if not file_path:
            return None
            
        # Determine the preview file path (typically same name with different extension)
        base_name = os.path.splitext(file_path)[0]
        preview_extensions = ['.preview.png', '.preview.jpeg', '.preview.jpg', '.preview.mp4',
                            '.png', '.jpeg', '.jpg', '.mp4']
        
        for ext in preview_extensions:
            preview_path = f"{base_name}{ext}"
            if os.path.exists(preview_path):
                # Convert to static URL using config
                return config.get_preview_static_url(preview_path)
        
        return None
        
    async def get_top_tags(self, limit: int = 20) -> List[Dict[str, any]]:
        """Get top tags sorted by count"""
        # Make sure cache is initialized
        await self.get_cached_data()
        
        # Sort tags by count in descending order
        sorted_tags = sorted(
            [{"tag": tag, "count": count} for tag, count in self._tags_count.items()],
            key=lambda x: x['count'],
            reverse=True
        )
        
        # Return limited number
        return sorted_tags[:limit]
        
    async def get_base_models(self, limit: int = 20) -> List[Dict[str, any]]:
        """Get base models sorted by frequency"""
        # Make sure cache is initialized
        cache = await self.get_cached_data()
        
        # Count base model occurrences
        base_model_counts = {}
        for model in cache.raw_data:
            if 'base_model' in model and model['base_model']:
                base_model = model['base_model']
                base_model_counts[base_model] = base_model_counts.get(base_model, 0) + 1
        
        # Sort base models by count
        sorted_models = [{'name': model, 'count': count} for model, count in base_model_counts.items()]
        sorted_models.sort(key=lambda x: x['count'], reverse=True)
        
        # Return limited number
        return sorted_models[:limit]
        
    async def get_model_info_by_name(self, name):
        """Get model information by name"""
        try:
            # Get cached data
            cache = await self.get_cached_data()
            
            # Find the model by name
            for model in cache.raw_data:
                if model.get("file_name") == name:
                    return model
                    
            return None
        except Exception as e:
            logger.error(f"Error getting model info by name: {e}", exc_info=True)
            return None