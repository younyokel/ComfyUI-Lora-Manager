import json
import os
import logging
import asyncio
import shutil
from typing import List, Dict, Optional
from dataclasses import dataclass
from operator import itemgetter
from ..config import config
from ..utils.file_utils import load_metadata, get_file_info
from .lora_cache import LoraCache
from difflib import SequenceMatcher
from .lora_hash_index import LoraHashIndex

logger = logging.getLogger(__name__)

class LoraScanner:
    """Service for scanning and managing LoRA files"""
    
    _instance = None
    _lock = asyncio.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        # 确保初始化只执行一次
        if not hasattr(self, '_initialized'):
            self._cache: Optional[LoraCache] = None
            self._hash_index = LoraHashIndex()
            self._initialization_lock = asyncio.Lock()
            self._initialization_task: Optional[asyncio.Task] = None
            self._initialized = True
            self.file_monitor = None  # Add this line
            self._tags_count = {}  # Add a dictionary to store tag counts

    def set_file_monitor(self, monitor):
        """Set file monitor instance"""
        self.file_monitor = monitor

    @classmethod
    async def get_instance(cls):
        """Get singleton instance with async support"""
        async with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    async def  get_cached_data(self, force_refresh: bool = False) -> LoraCache:
        """Get cached LoRA data, refresh if needed"""
        async with self._initialization_lock:
            
            # 如果缓存未初始化但需要响应请求，返回空缓存
            if self._cache is None and not force_refresh:
                return LoraCache(
                    raw_data=[],
                    sorted_by_name=[],
                    sorted_by_date=[],
                    folders=[]
                )

            # 如果正在初始化，等待完成
            if self._initialization_task and not self._initialization_task.done():
                try:
                    await self._initialization_task
                except Exception as e:
                    logger.error(f"Cache initialization failed: {e}")
                    self._initialization_task = None
            
            if (self._cache is None or force_refresh):
                
                # 创建新的初始化任务
                if not self._initialization_task or self._initialization_task.done():
                    self._initialization_task = asyncio.create_task(self._initialize_cache())
                
                try:
                    await self._initialization_task
                except Exception as e:
                    logger.error(f"Cache initialization failed: {e}")
                    # 如果缓存已存在，继续使用旧缓存
                    if self._cache is None:
                        raise  # 如果没有缓存，则抛出异常
            
            return self._cache

    async def _initialize_cache(self) -> None:
        """Initialize or refresh the cache"""
        try:
            # Clear existing hash index
            self._hash_index.clear()
            
            # Clear existing tags count
            self._tags_count = {}
            
            # Scan for new data
            raw_data = await self.scan_all_loras()
            
            # Build hash index and tags count
            for lora_data in raw_data:
                if 'sha256' in lora_data and 'file_path' in lora_data:
                    self._hash_index.add_entry(lora_data['sha256'], lora_data['file_path'])
                
                # Count tags
                if 'tags' in lora_data and lora_data['tags']:
                    for tag in lora_data['tags']:
                        self._tags_count[tag] = self._tags_count.get(tag, 0) + 1
            
            # Update cache
            self._cache = LoraCache(
                raw_data=raw_data,
                sorted_by_name=[],
                sorted_by_date=[],
                folders=[]
            )
            
            # Call resort_cache to create sorted views
            await self._cache.resort()

            self._initialization_task = None
            logger.info("LoRA Manager: Cache initialization completed")
        except Exception as e:
            logger.error(f"LoRA Manager: Error initializing cache: {e}")
            self._cache = LoraCache(
                raw_data=[],
                sorted_by_name=[],
                sorted_by_date=[],
                folders=[]
            )

    def fuzzy_match(self, text: str, pattern: str, threshold: float = 0.7) -> bool:
        """
        Check if text matches pattern using fuzzy matching.
        Returns True if similarity ratio is above threshold.
        """
        if not pattern or not text:
            return False
        
        # Convert both to lowercase for case-insensitive matching
        text = text.lower()
        pattern = pattern.lower()
        
        # Split pattern into words
        search_words = pattern.split()
        
        # Check each word
        for word in search_words:
            # First check if word is a substring (faster)
            if word in text:
                continue
            
            # If not found as substring, try fuzzy matching
            # Check if any part of the text matches this word
            found_match = False
            for text_part in text.split():
                ratio = SequenceMatcher(None, text_part, word).ratio()
                if ratio >= threshold:
                    found_match = True
                    break
                
            if not found_match:
                return False
        
        # All words found either as substrings or fuzzy matches
        return True

    async def get_paginated_data(self, page: int, page_size: int, sort_by: str = 'name', 
                               folder: str = None, search: str = None, fuzzy: bool = False,
                               recursive: bool = False, base_models: list = None, tags: list = None,
                               search_options: dict = None) -> Dict:
        """Get paginated and filtered lora data
        
        Args:
            page: Current page number (1-based)
            page_size: Number of items per page
            sort_by: Sort method ('name' or 'date')
            folder: Filter by folder path
            search: Search term
            fuzzy: Use fuzzy matching for search
            recursive: Include subfolders when folder filter is applied
            base_models: List of base models to filter by
            tags: List of tags to filter by
            search_options: Dictionary with search options (filename, modelname, tags)
        """
        cache = await self.get_cached_data()

        # Get default search options if not provided
        if search_options is None:
            search_options = {
                'filename': True,
                'modelname': True,
                'tags': False
            }

        # Get the base data set
        filtered_data = cache.sorted_by_date if sort_by == 'date' else cache.sorted_by_name
        
        # Apply folder filtering
        if folder is not None:
            if recursive:
                # Recursive mode: match all paths starting with this folder
                filtered_data = [
                    item for item in filtered_data 
                    if item['folder'].startswith(folder + '/') or item['folder'] == folder
                ]
            else:
                # Non-recursive mode: match exact folder
                filtered_data = [
                    item for item in filtered_data 
                    if item['folder'] == folder
                ]
        
        # Apply base model filtering
        if base_models and len(base_models) > 0:
            filtered_data = [
                item for item in filtered_data
                if item.get('base_model') in base_models
            ]
        
        # Apply tag filtering
        if tags and len(tags) > 0:
            filtered_data = [
                item for item in filtered_data
                if any(tag in item.get('tags', []) for tag in tags)
            ]
        
        # Apply search filtering
        if search:
            if fuzzy:
                filtered_data = [
                    item for item in filtered_data 
                    if self._fuzzy_search_match(item, search, search_options)
                ]
            else:
                filtered_data = [
                    item for item in filtered_data 
                    if self._exact_search_match(item, search, search_options)
                ]

        # Calculate pagination
        total_items = len(filtered_data)
        start_idx = (page - 1) * page_size
        end_idx = min(start_idx + page_size, total_items)
        
        result = {
            'items': filtered_data[start_idx:end_idx],
            'total': total_items,
            'page': page,
            'page_size': page_size,
            'total_pages': (total_items + page_size - 1) // page_size
        }
        
        return result

    def _fuzzy_search_match(self, item: Dict, search: str, search_options: Dict) -> bool:
        """Check if an item matches the search term using fuzzy matching with search options"""
        # Check filename if enabled
        if search_options.get('filename', True) and self.fuzzy_match(item.get('file_name', ''), search):
            return True
            
        # Check model name if enabled
        if search_options.get('modelname', True) and self.fuzzy_match(item.get('model_name', ''), search):
            return True
            
        # Check tags if enabled
        if search_options.get('tags', False) and item.get('tags'):
            for tag in item['tags']:
                if self.fuzzy_match(tag, search):
                    return True
                    
        return False

    def _exact_search_match(self, item: Dict, search: str, search_options: Dict) -> bool:
        """Check if an item matches the search term using exact matching with search options"""
        search = search.lower()
        
        # Check filename if enabled
        if search_options.get('filename', True) and search in item.get('file_name', '').lower():
            return True
            
        # Check model name if enabled
        if search_options.get('modelname', True) and search in item.get('model_name', '').lower():
            return True
            
        # Check tags if enabled
        if search_options.get('tags', False) and item.get('tags'):
            for tag in item['tags']:
                if search in tag.lower():
                    return True
                    
        return False

    def invalidate_cache(self):
        """Invalidate the current cache"""
        self._cache = None

    async def scan_all_loras(self) -> List[Dict]:
        """Scan all LoRA directories and return metadata"""
        all_loras = []
        
        # 分目录异步扫描
        scan_tasks = []
        for loras_root in config.loras_roots:
            task = asyncio.create_task(self._scan_directory(loras_root))
            scan_tasks.append(task)
            
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
        original_root = root_path  # 保存原始根路径
        
        async def scan_recursive(path: str, visited_paths: set):
            """递归扫描目录，避免循环链接"""
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
                            if entry.is_file(follow_symlinks=True) and entry.name.endswith('.safetensors'):
                                # 使用原始路径而不是真实路径
                                file_path = entry.path.replace(os.sep, "/")
                                await self._process_single_file(file_path, original_root, loras)
                                await asyncio.sleep(0)
                            elif entry.is_dir(follow_symlinks=True):
                                # 对于目录，使用原始路径继续扫描
                                await scan_recursive(entry.path, visited_paths)
                        except Exception as e:
                            logger.error(f"Error processing entry {entry.path}: {e}")
            except Exception as e:
                logger.error(f"Error scanning {path}: {e}")

        await scan_recursive(root_path, set())
        return loras

    async def _process_single_file(self, file_path: str, root_path: str, loras: list):
        """处理单个文件并添加到结果列表"""
        try:
            result = await self._process_lora_file(file_path, root_path)
            if result:
                loras.append(result)
        except Exception as e:
            logger.error(f"Error processing {file_path}: {e}")

    async def _process_lora_file(self, file_path: str, root_path: str) -> Dict:
        """Process a single LoRA file and return its metadata"""
        # Try loading existing metadata
        metadata = await load_metadata(file_path)
        
        if metadata is None:
            # Create new metadata if none exists
            metadata = await get_file_info(file_path)
        
        # Convert to dict and add folder info
        lora_data = metadata.to_dict()
        # Try to fetch missing metadata from Civitai if needed
        await self._fetch_missing_metadata(file_path, lora_data)
        rel_path = os.path.relpath(file_path, root_path)
        folder = os.path.dirname(rel_path)
        lora_data['folder'] = folder.replace(os.path.sep, '/')
        
        return lora_data

    async def _fetch_missing_metadata(self, file_path: str, lora_data: Dict) -> None:
        """Fetch missing description and tags from Civitai if needed
        
        Args:
            file_path: Path to the lora file
            lora_data: Lora metadata dictionary to update
        """
        try:
            # Skip if already marked as deleted on Civitai
            if lora_data.get('civitai_deleted', False):
                logger.debug(f"Skipping metadata fetch for {file_path}: marked as deleted on Civitai")
                return

            # Check if we need to fetch additional metadata from Civitai
            needs_metadata_update = False
            model_id = None
            
            # Check if we have Civitai model ID but missing metadata
            if lora_data.get('civitai'):
                # Try to get model ID directly from the correct location
                model_id = lora_data['civitai'].get('modelId')
                
                if model_id:
                    model_id = str(model_id)
                    # Check if tags are missing or empty
                    tags_missing = not lora_data.get('tags') or len(lora_data.get('tags', [])) == 0
                    
                    # Check if description is missing or empty
                    desc_missing = not lora_data.get('modelDescription') or lora_data.get('modelDescription') in (None, "")
                    
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
                    # Mark as deleted to avoid future API calls
                    lora_data['civitai_deleted'] = True
                    
                    # Save the updated metadata back to file
                    metadata_path = os.path.splitext(file_path)[0] + '.metadata.json'
                    with open(metadata_path, 'w', encoding='utf-8') as f:
                        json.dump(lora_data, f, indent=2, ensure_ascii=False)
                
                # Process valid metadata if available
                elif model_metadata:
                    logger.debug(f"Updating metadata for {file_path} with model ID {model_id}")
                    
                    # Update tags if they were missing
                    if model_metadata.get('tags') and (not lora_data.get('tags') or len(lora_data.get('tags', [])) == 0):
                        lora_data['tags'] = model_metadata['tags']
                    
                    # Update description if it was missing
                    if model_metadata.get('description') and (not lora_data.get('modelDescription') or lora_data.get('modelDescription') in (None, "")):
                        lora_data['modelDescription'] = model_metadata['description']
                    
                    # Save the updated metadata back to file
                    metadata_path = os.path.splitext(file_path)[0] + '.metadata.json'
                    with open(metadata_path, 'w', encoding='utf-8') as f:
                        json.dump(lora_data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to update metadata from Civitai for {file_path}: {e}")

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

    async def scan_single_lora(self, file_path: str) -> Optional[Dict]:
        """Scan a single LoRA file and return its metadata"""
        try:
            if not os.path.exists(os.path.realpath(file_path)):
                return None
                
            # 获取基本文件信息
            metadata = await get_file_info(file_path)
            if not metadata:
                return None
                
            folder = self._calculate_folder(file_path)
                    
            # 确保 folder 字段存在
            metadata_dict = metadata.to_dict()
            metadata_dict['folder'] = folder or ''
            
            return metadata_dict
            
        except Exception as e:
            logger.error(f"Error scanning {file_path}: {e}")
            return None
    
    def _calculate_folder(self, file_path: str) -> str:
        """Calculate the folder path for a LoRA file"""
        # 使用原始路径计算相对路径
        for root in config.loras_roots:
            if file_path.startswith(root):
                rel_path = os.path.relpath(file_path, root)
                return os.path.dirname(rel_path).replace(os.path.sep, '/')
        return ''

    async def move_model(self, source_path: str, target_path: str) -> bool:
        """Move a model and its associated files to a new location"""
        try:
            # 保持原始路径格式
            source_path = source_path.replace(os.sep, '/')
            target_path = target_path.replace(os.sep, '/')
            
            # 其余代码保持不变
            base_name = os.path.splitext(os.path.basename(source_path))[0]
            source_dir = os.path.dirname(source_path)
            
            os.makedirs(target_path, exist_ok=True)
            
            target_lora = os.path.join(target_path, f"{base_name}.safetensors").replace(os.sep, '/')

            # 使用真实路径进行文件操作
            real_source = os.path.realpath(source_path)
            real_target = os.path.realpath(target_lora)
            
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
            
            # 使用真实路径进行文件操作
            shutil.move(real_source, real_target)
            
            # Move associated files
            source_metadata = os.path.join(source_dir, f"{base_name}.metadata.json")
            if os.path.exists(source_metadata):
                target_metadata = os.path.join(target_path, f"{base_name}.metadata.json")
                shutil.move(source_metadata, target_metadata)
                metadata = await self._update_metadata_paths(target_metadata, target_lora)
            
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
            await self.update_single_lora_cache(source_path, target_lora, metadata)
            
            return True
            
        except Exception as e:
            logger.error(f"Error moving model: {e}", exc_info=True)
            return False
        
    async def update_single_lora_cache(self, original_path: str, new_path: str, metadata: Dict) -> bool:
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
                self._hash_index.add_entry(metadata['sha256'], new_path)
            
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

    async def _update_metadata_paths(self, metadata_path: str, lora_path: str) -> Dict:
        """Update file paths in metadata file"""
        try:
            with open(metadata_path, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
            
            # Update file_path
            metadata['file_path'] = lora_path.replace(os.sep, '/')
            
            # Update preview_url if exists
            if 'preview_url' in metadata:
                preview_dir = os.path.dirname(lora_path)
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

    # Add new methods for hash index functionality
    def has_lora_hash(self, sha256: str) -> bool:
        """Check if a LoRA with given hash exists"""
        return self._hash_index.has_hash(sha256)
        
    def get_lora_path_by_hash(self, sha256: str) -> Optional[str]:
        """Get file path for a LoRA by its hash"""
        return self._hash_index.get_path(sha256)
        
    def get_lora_hash_by_path(self, file_path: str) -> Optional[str]:
        """Get hash for a LoRA by its file path"""
        return self._hash_index.get_hash(file_path)

    # Add new method to get top tags
    async def get_top_tags(self, limit: int = 20) -> List[Dict[str, any]]:
        """Get top tags sorted by count
        
        Args:
            limit: Maximum number of tags to return
            
        Returns:
            List of dictionaries with tag name and count, sorted by count
        """
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

