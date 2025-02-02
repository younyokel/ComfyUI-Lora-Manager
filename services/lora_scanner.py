import os
import logging
import time
from typing import List, Dict, Optional
from dataclasses import dataclass
from operator import itemgetter
from ..config import config
from ..utils.file_utils import load_metadata, get_file_info, save_metadata
from ..utils.lora_metadata import extract_lora_metadata

logger = logging.getLogger(__name__)

@dataclass
class LoraCache:
    """Cache structure for LoRA data"""
    raw_data: List[Dict]
    sorted_by_name: List[Dict]
    sorted_by_date: List[Dict]
    folders: List[str]
    timestamp: float

class LoraScanner:
    """Service for scanning and managing LoRA files"""

    def __init__(self):
        self._cache: Optional[LoraCache] = None
        self.cache_ttl = 300  # 5 minutes cache TTL

    async def get_cached_data(self, force_refresh: bool = False) -> LoraCache:
        """Get cached LoRA data, refresh if needed"""
        current_time = time.time()
        
        if (self._cache is None or 
            force_refresh or 
            current_time - self._cache.timestamp > self.cache_ttl):
            
            # Scan for new data
            raw_data = await self.scan_all_loras()
            
            # Create sorted views
            sorted_by_name = sorted(raw_data, key=itemgetter('model_name'))
            sorted_by_date = sorted(raw_data, key=itemgetter('modified'), reverse=True)
            folders = sorted(list(set(l['folder'] for l in raw_data)))
            
            # Update cache
            self._cache = LoraCache(
                raw_data=raw_data,
                sorted_by_name=sorted_by_name,
                sorted_by_date=sorted_by_date,
                folders=folders,
                timestamp=current_time
            )
        
        return self._cache

    async def get_paginated_data(self, 
                                page: int, 
                                page_size: int, 
                                sort_by: str = 'date',
                                folder: Optional[str] = None) -> Dict:
        """Get paginated LoRA data"""
        cache = await self.get_cached_data()
        
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
            base_model_info = await extract_lora_metadata(file_path)
            metadata.base_model = base_model_info['base_model']
            await save_metadata(file_path, metadata)
        
        # Convert to dict and add folder info
        lora_data = metadata.to_dict()
        rel_path = os.path.relpath(file_path, root_path)
        folder = os.path.dirname(rel_path)
        lora_data['folder'] = folder.replace(os.path.sep, '/')
        
        return lora_data
