import json
import os
import logging
import asyncio
import shutil
import time
import re
from typing import List, Dict, Optional, Set

from ..utils.models import LoraMetadata
from ..config import config
from .model_scanner import ModelScanner
from .model_hash_index import ModelHashIndex  # Changed from LoraHashIndex to ModelHashIndex
from .settings_manager import settings
from ..utils.constants import NSFW_LEVELS
from ..utils.utils import fuzzy_match
from .service_registry import ServiceRegistry
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
    
    async def get_paginated_data(self, page: int, page_size: int, sort_by: str = 'name', 
                               folder: str = None, search: str = None, fuzzy_search: bool = False,
                               base_models: list = None, tags: list = None,
                               search_options: dict = None, hash_filters: dict = None,
                               favorites_only: bool = False, first_letter: str = None) -> Dict:
        """Get paginated and filtered lora data
        
        Args:
            page: Current page number (1-based)
            page_size: Number of items per page
            sort_by: Sort method ('name' or 'date')
            folder: Filter by folder path
            search: Search term
            fuzzy_search: Use fuzzy matching for search
            base_models: List of base models to filter by
            tags: List of tags to filter by
            search_options: Dictionary with search options (filename, modelname, tags, recursive)
            hash_filters: Dictionary with hash filtering options (single_hash or multiple_hashes)
            favorites_only: Filter for favorite models only
            first_letter: Filter by first letter of model name
        """
        cache = await self.get_cached_data()

        # Get default search options if not provided
        if search_options is None:
            search_options = {
                'filename': True,
                'modelname': True,
                'tags': False,
                'recursive': False,
            }

        # Get the base data set
        filtered_data = cache.sorted_by_date if sort_by == 'date' else cache.sorted_by_name
        
        # Apply hash filtering if provided (highest priority)
        if hash_filters:
            single_hash = hash_filters.get('single_hash')
            multiple_hashes = hash_filters.get('multiple_hashes')
            
            if single_hash:
                # Filter by single hash
                single_hash = single_hash.lower()  # Ensure lowercase for matching
                filtered_data = [
                    lora for lora in filtered_data
                    if lora.get('sha256', '').lower() == single_hash
                ]
            elif multiple_hashes:
                # Filter by multiple hashes
                hash_set = set(hash.lower() for hash in multiple_hashes)  # Convert to set for faster lookup
                filtered_data = [
                    lora for lora in filtered_data
                    if lora.get('sha256', '').lower() in hash_set
                ]
            

            # Jump to pagination
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
        
        # Apply SFW filtering if enabled
        if settings.get('show_only_sfw', False):
            filtered_data = [
                lora for lora in filtered_data
                if not lora.get('preview_nsfw_level') or lora.get('preview_nsfw_level') < NSFW_LEVELS['R']
            ]
        
        # Apply favorites filtering if enabled
        if favorites_only:
            filtered_data = [
                lora for lora in filtered_data
                if lora.get('favorite', False) is True
            ]
            
        # Apply first letter filtering
        if first_letter:
            filtered_data = self._filter_by_first_letter(filtered_data, first_letter)
        
        # Apply folder filtering
        if folder is not None:
            if search_options.get('recursive', False):
                # Recursive folder filtering - include all subfolders
                filtered_data = [
                    lora for lora in filtered_data
                    if lora['folder'].startswith(folder)
                ]
            else:
                # Exact folder filtering
                filtered_data = [
                    lora for lora in filtered_data
                    if lora['folder'] == folder
                ]
        
        # Apply base model filtering
        if base_models and len(base_models) > 0:
            filtered_data = [
                lora for lora in filtered_data
                if lora.get('base_model') in base_models
            ]
        
        # Apply tag filtering
        if tags and len(tags) > 0:
            filtered_data = [
                lora for lora in filtered_data
                if any(tag in lora.get('tags', []) for tag in tags)
            ]
        
        # Apply search filtering
        if search:
            search_results = []
            search_opts = search_options or {}
            
            for lora in filtered_data:
                # Search by file name
                if search_opts.get('filename', True):
                    if fuzzy_match(lora.get('file_name', ''), search):
                        search_results.append(lora)
                        continue
                        
                # Search by model name
                if search_opts.get('modelname', True):
                    if fuzzy_match(lora.get('model_name', ''), search):
                        search_results.append(lora)
                        continue
                        
                # Search by tags
                if search_opts.get('tags', False) and 'tags' in lora:
                    if any(fuzzy_match(tag, search) for tag in lora['tags']):
                        search_results.append(lora)
                        continue
            
            filtered_data = search_results

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

    def _filter_by_first_letter(self, data, letter):
        """Filter data by first letter of model name
        
        Special handling:
        - '#': Numbers (0-9)
        - '@': Special characters (not alphanumeric)
        - '漢': CJK characters
        """
        filtered_data = []
        
        for lora in data:
            model_name = lora.get('model_name', '')
            if not model_name:
                continue
                
            first_char = model_name[0].upper()
            
            if letter == '#' and first_char.isdigit():
                filtered_data.append(lora)
            elif letter == '@' and not first_char.isalnum():
                # Special characters (not alphanumeric)
                filtered_data.append(lora)
            elif letter == '漢' and self._is_cjk_character(first_char):
                # CJK characters
                filtered_data.append(lora)
            elif letter.upper() == first_char:
                # Regular alphabet matching
                filtered_data.append(lora)
                
        return filtered_data
    
    def _is_cjk_character(self, char):
        """Check if character is a CJK character"""
        # Define Unicode ranges for CJK characters
        cjk_ranges = [
            (0x4E00, 0x9FFF),   # CJK Unified Ideographs
            (0x3400, 0x4DBF),   # CJK Unified Ideographs Extension A
            (0x20000, 0x2A6DF), # CJK Unified Ideographs Extension B
            (0x2A700, 0x2B73F), # CJK Unified Ideographs Extension C
            (0x2B740, 0x2B81F), # CJK Unified Ideographs Extension D
            (0x2B820, 0x2CEAF), # CJK Unified Ideographs Extension E
            (0x2CEB0, 0x2EBEF), # CJK Unified Ideographs Extension F
            (0x30000, 0x3134F), # CJK Unified Ideographs Extension G
            (0xF900, 0xFAFF),   # CJK Compatibility Ideographs
            (0x3300, 0x33FF),   # CJK Compatibility
            (0x3200, 0x32FF),   # Enclosed CJK Letters and Months
            (0x3100, 0x312F),   # Bopomofo
            (0x31A0, 0x31BF),   # Bopomofo Extended
            (0x3040, 0x309F),   # Hiragana
            (0x30A0, 0x30FF),   # Katakana
            (0x31F0, 0x31FF),   # Katakana Phonetic Extensions
            (0xAC00, 0xD7AF),   # Hangul Syllables
            (0x1100, 0x11FF),   # Hangul Jamo
            (0xA960, 0xA97F),   # Hangul Jamo Extended-A
            (0xD7B0, 0xD7FF),   # Hangul Jamo Extended-B
        ]
        
        code_point = ord(char)
        return any(start <= code_point <= end for start, end in cjk_ranges)
    
    async def get_letter_counts(self):
        """Get count of models for each letter of the alphabet"""
        cache = await self.get_cached_data()
        data = cache.sorted_by_name
        
        # Define letter categories
        letters = {
            '#': 0,  # Numbers
            'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0, 'F': 0, 'G': 0, 'H': 0,
            'I': 0, 'J': 0, 'K': 0, 'L': 0, 'M': 0, 'N': 0, 'O': 0, 'P': 0,
            'Q': 0, 'R': 0, 'S': 0, 'T': 0, 'U': 0, 'V': 0, 'W': 0, 'X': 0,
            'Y': 0, 'Z': 0,
            '@': 0,  # Special characters
            '漢': 0   # CJK characters
        }
        
        # Count models for each letter
        for lora in data:
            model_name = lora.get('model_name', '')
            if not model_name:
                continue
                
            first_char = model_name[0].upper()
            
            if first_char.isdigit():
                letters['#'] += 1
            elif first_char in letters:
                letters[first_char] += 1
            elif self._is_cjk_character(first_char):
                letters['漢'] += 1
            elif not first_char.isalnum():
                letters['@'] += 1
                
        return letters

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
        """Get base models used in loras sorted by frequency"""
        # Make sure cache is initialized
        cache = await self.get_cached_data()
        
        # Count base model occurrences
        base_model_counts = {}
        for lora in cache.raw_data:
            if 'base_model' in lora and lora['base_model']:
                base_model = lora['base_model']
                base_model_counts[base_model] = base_model_counts.get(base_model, 0) + 1
        
        # Sort base models by count
        sorted_models = [{'name': model, 'count': count} for model, count in base_model_counts.items()]
        sorted_models.sort(key=lambda x: x['count'], reverse=True)
        
        # Return limited number
        return sorted_models[:limit]

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

