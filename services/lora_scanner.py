import os
import logging
import time
import asyncio
from typing import List, Dict, Optional
from dataclasses import dataclass
from operator import itemgetter
from ..config import config
from ..utils.file_utils import load_metadata, get_file_info
from .lora_cache import LoraCache

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
            self._initialization_lock = asyncio.Lock()
            self._initialization_task: Optional[asyncio.Task] = None
            self._initialized = True

    @classmethod
    async def get_instance(cls):
        """Get singleton instance with async support"""
        async with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    async def get_cached_data(self, force_refresh: bool = False) -> LoraCache:
        """Get cached LoRA data, refresh if needed"""
        async with self._initialization_lock:
            
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
        # Scan for new data
        raw_data = await self.scan_all_loras()
        
        # Update cache
        self._cache = LoraCache(
            raw_data=raw_data,
            sorted_by_name=[],
            sorted_by_date=[],
            folders=[]
        )
        
        # Call resort_cache to create sorted views
        await self._cache.resort()

    async def get_paginated_data(self, 
                                page: int, 
                                page_size: int, 
                                sort_by: str = 'date',
                                folder: Optional[str] = None) -> Dict:
        """Get paginated LoRA data"""
        # 确保缓存已初始化
        cache = await self.get_cached_data()

        async with cache._lock:
        
            # Select sorted data based on sort_by parameter
            data = (cache.sorted_by_date if sort_by == 'date' 
                    else cache.sorted_by_name)
            
            # Apply folder filter if specified
            if folder is not None:
                data = [item for item in data if item['folder'] == folder]
            
            # Calculate pagination
            total_items = len(data)
            start_idx = (page - 1) * page_size
            end_idx = min(start_idx + page_size, total_items)
            
            return {
                'items': data[start_idx:end_idx],
                'total': total_items,
                'page': page,
                'page_size': page_size,
                'total_pages': (total_items + page_size - 1) // page_size
            }

    def invalidate_cache(self):
        """Invalidate the current cache"""
        self._cache = None

    async def scan_all_loras(self) -> List[Dict]:
        """Scan all LoRA directories and return metadata"""
        all_loras = []
        
        for loras_root in config.loras_roots:
            try:
                loras = await self._scan_directory(loras_root)
                all_loras.extend(loras)
            except Exception as e:
                logger.error(f"Error scanning directory {loras_root}: {e}")
                
        return all_loras

    async def _scan_directory(self, root_path: str) -> List[Dict]:
        """Scan a single directory for LoRA files"""
        loras = []
        
        for root, _, files in os.walk(root_path):
            for filename in (f for f in files if f.endswith('.safetensors')):
                try:
                    file_path = os.path.join(root, filename).replace(os.sep, "/")
                    lora_data = await self._process_lora_file(file_path, root_path)
                    if lora_data:
                        loras.append(lora_data)
                except Exception as e:
                    logger.error(f"Error processing {filename}: {e}")
                    
        return loras

    async def _process_lora_file(self, file_path: str, root_path: str) -> Dict:
        """Process a single LoRA file and return its metadata"""
        # Try loading existing metadata
        metadata = await load_metadata(file_path)
        
        if metadata is None:
            # Create new metadata if none exists
            metadata = await get_file_info(file_path)
        
        # Convert to dict and add folder info
        lora_data = metadata.to_dict()
        rel_path = os.path.relpath(file_path, root_path)
        folder = os.path.dirname(rel_path)
        lora_data['folder'] = folder.replace(os.path.sep, '/')
        
        return lora_data

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
            
        return self._cache.update_preview_url(file_path, preview_url)

    async def scan_single_lora(self, file_path: str) -> Optional[Dict]:
        """Scan a single LoRA file and return its metadata"""
        try:
            if not os.path.exists(file_path):
                return None
                
            # 获取基本文件信息
            metadata = await get_file_info(file_path)
            if not metadata:
                return None
                
            # 计算相对于 lora_roots 的文件夹路径
            folder = None
            file_dir = os.path.dirname(file_path)
            for root in config.loras_roots:
                if file_dir.startswith(root):
                    rel_path = os.path.relpath(file_dir, root)
                    if rel_path == '.':
                        folder = ''  # 根目录
                    else:
                        folder = rel_path.replace(os.sep, '/')
                    break
                    
            # 确保 folder 字段存在
            metadata_dict = metadata.to_dict()
            metadata_dict['folder'] = folder or ''
            
            return metadata_dict
            
        except Exception as e:
            logger.error(f"Error scanning {file_path}: {e}")
            return None

