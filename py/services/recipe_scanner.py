import os
import logging
import asyncio
import json
from typing import List, Dict, Optional, Any
from ..config import config
from .recipe_cache import RecipeCache
from .lora_scanner import LoraScanner
from .civitai_client import CivitaiClient
from ..utils.utils import fuzzy_match
import sys

logger = logging.getLogger(__name__)

class RecipeScanner:
    """Service for scanning and managing recipe images"""
    
    _instance = None
    _lock = asyncio.Lock()
    
    def __new__(cls, lora_scanner: Optional[LoraScanner] = None):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._lora_scanner = lora_scanner
            cls._instance._civitai_client = CivitaiClient()
        return cls._instance
    
    def __init__(self, lora_scanner: Optional[LoraScanner] = None):
        # Ensure initialization only happens once
        if not hasattr(self, '_initialized'):
            self._cache: Optional[RecipeCache] = None
            self._initialization_lock = asyncio.Lock()
            self._initialization_task: Optional[asyncio.Task] = None
            self._is_initializing = False
            if lora_scanner:
                self._lora_scanner = lora_scanner
            self._initialized = True
            
            # Initialization will be scheduled by LoraManager
    
    @property
    def recipes_dir(self) -> str:
        """Get path to recipes directory"""
        if not config.loras_roots:
            return ""
        
        # config.loras_roots already sorted case-insensitively, use the first one
        recipes_dir = os.path.join(config.loras_roots[0], "recipes")
        os.makedirs(recipes_dir, exist_ok=True)
        
        return recipes_dir
    
    async def get_cached_data(self, force_refresh: bool = False) -> RecipeCache:
        """Get cached recipe data, refresh if needed"""
        # If cache is already initialized and no refresh is needed, return it immediately
        if self._cache is not None and not force_refresh:
            return self._cache

        # If another initialization is already in progress, wait for it to complete
        if self._is_initializing and not force_refresh:
            return self._cache or RecipeCache(raw_data=[], sorted_by_name=[], sorted_by_date=[])

        # Try to acquire the lock with a timeout to prevent deadlocks
        try:
            async with self._initialization_lock:
                # Check again after acquiring the lock
                if self._cache is not None and not force_refresh:
                    return self._cache
                
                # Mark as initializing to prevent concurrent initializations
                self._is_initializing = True
                
                try:
                    # Remove dependency on lora scanner initialization
                    # Scan for recipe data directly
                    raw_data = await self.scan_all_recipes()
                    
                    # Update cache
                    self._cache = RecipeCache(
                        raw_data=raw_data,
                        sorted_by_name=[],
                        sorted_by_date=[]
                    )
                    
                    # Resort cache
                    await self._cache.resort()
                    
                    return self._cache
                
                except Exception as e:
                    logger.error(f"Recipe Manager: Error initializing cache: {e}", exc_info=True)
                    # Create empty cache on error
                    self._cache = RecipeCache(
                        raw_data=[],
                        sorted_by_name=[],
                        sorted_by_date=[]
                    )
                    return self._cache
                finally:
                    # Mark initialization as complete
                    self._is_initializing = False
        
        except Exception as e:
            logger.error(f"Unexpected error in get_cached_data: {e}")
            return self._cache or RecipeCache(raw_data=[], sorted_by_name=[], sorted_by_date=[])
    
    async def scan_all_recipes(self) -> List[Dict]:
        """Scan all recipe JSON files and return metadata"""
        recipes = []
        recipes_dir = self.recipes_dir
        
        if not recipes_dir or not os.path.exists(recipes_dir):
            logger.warning(f"Recipes directory not found: {recipes_dir}")
            return recipes
        
        # Get all recipe JSON files in the recipes directory
        recipe_files = []
        for root, _, files in os.walk(recipes_dir):
            recipe_count = sum(1 for f in files if f.lower().endswith('.recipe.json'))
            if recipe_count > 0:
                for file in files:
                    if file.lower().endswith('.recipe.json'):
                        recipe_files.append(os.path.join(root, file))
        
        # Process each recipe file
        for recipe_path in recipe_files:
            recipe_data = await self._load_recipe_file(recipe_path)
            if recipe_data:
                recipes.append(recipe_data)
        
        return recipes
    
    async def _load_recipe_file(self, recipe_path: str) -> Optional[Dict]:
        """Load recipe data from a JSON file"""
        try:
            with open(recipe_path, 'r', encoding='utf-8') as f:
                recipe_data = json.load(f)
            
            # Validate recipe data
            if not recipe_data or not isinstance(recipe_data, dict):
                logger.warning(f"Invalid recipe data in {recipe_path}")
                return None
            
            # Ensure required fields exist
            required_fields = ['id', 'file_path', 'title']
            for field in required_fields:
                if field not in recipe_data:
                    logger.warning(f"Missing required field '{field}' in {recipe_path}")
                    return None
            
            # Ensure the image file exists
            image_path = recipe_data.get('file_path')
            if not os.path.exists(image_path):
                logger.warning(f"Recipe image not found: {image_path}")
                # Try to find the image in the same directory as the recipe
                recipe_dir = os.path.dirname(recipe_path)
                image_filename = os.path.basename(image_path)
                alternative_path = os.path.join(recipe_dir, image_filename)
                if os.path.exists(alternative_path):
                    recipe_data['file_path'] = alternative_path
                else:
                    logger.warning(f"Could not find alternative image path for {image_path}")
            
            # Ensure loras array exists
            if 'loras' not in recipe_data:
                recipe_data['loras'] = []
            
            # Ensure gen_params exists
            if 'gen_params' not in recipe_data:
                recipe_data['gen_params'] = {}
            
            # Update lora information with local paths and availability
            await self._update_lora_information(recipe_data)
            
            return recipe_data
        except Exception as e:
            logger.error(f"Error loading recipe file {recipe_path}: {e}")
            import traceback
            traceback.print_exc(file=sys.stderr)
            return None
    
    async def _update_lora_information(self, recipe_data: Dict) -> bool:
        """Update LoRA information with hash and file_name
        
        Returns:
            bool: True if metadata was updated
        """
        if not recipe_data.get('loras'):
            return False
        
        metadata_updated = False
        
        for lora in recipe_data['loras']:
            # Skip if already has complete information
            if 'hash' in lora and 'file_name' in lora and lora['file_name']:
                continue
                
            # If has modelVersionId but no hash, look in lora cache first, then fetch from Civitai
            if 'modelVersionId' in lora and not lora.get('hash'):
                model_version_id = lora['modelVersionId']

                # Try to find in lora cache first
                hash_from_cache = await self._find_hash_in_lora_cache(model_version_id)
                if hash_from_cache:
                    lora['hash'] = hash_from_cache
                    metadata_updated = True
                else:
                    # If not in cache, fetch from Civitai
                    hash_from_civitai = await self._get_hash_from_civitai(model_version_id)
                    if hash_from_civitai:
                        lora['hash'] = hash_from_civitai
                        metadata_updated = True
                    else:
                        logger.warning(f"Could not get hash for modelVersionId {model_version_id}")
            
            # If has hash but no file_name, look up in lora library
            if 'hash' in lora and (not lora.get('file_name') or not lora['file_name']):
                hash_value = lora['hash']
                
                if self._lora_scanner.has_lora_hash(hash_value):
                    lora_path = self._lora_scanner.get_lora_path_by_hash(hash_value)
                    if lora_path:
                        file_name = os.path.splitext(os.path.basename(lora_path))[0]
                        lora['file_name'] = file_name
                        metadata_updated = True
                else:
                    # Lora not in library
                    lora['file_name'] = ''
                    metadata_updated = True
        
        return metadata_updated
    
    async def _find_hash_in_lora_cache(self, model_version_id: str) -> Optional[str]:
        """Find hash in lora cache based on modelVersionId"""
        try:
            # Get all loras from cache
            if not self._lora_scanner:
                return None
                
            cache = await self._lora_scanner.get_cached_data()
            if not cache or not cache.raw_data:
                return None
                
            # Find lora with matching civitai.id
            for lora in cache.raw_data:
                civitai_data = lora.get('civitai', {})
                if civitai_data and str(civitai_data.get('id', '')) == str(model_version_id):
                    return lora.get('sha256')
                    
            return None
        except Exception as e:
            logger.error(f"Error finding hash in lora cache: {e}")
            return None
    
    async def _get_hash_from_civitai(self, model_version_id: str) -> Optional[str]:
        """Get hash from Civitai API"""
        try:
            if not self._civitai_client:
                return None
                
            version_info = await self._civitai_client.get_model_version_info(model_version_id)
            
            if not version_info or not version_info.get('files'):
                logger.warning(f"No files found in version info for ID: {model_version_id}")
                return None
                
            # Get hash from the first file
            for file_info in version_info.get('files', []):
                if file_info.get('hashes', {}).get('SHA256'):
                    return file_info['hashes']['SHA256']
                    
            logger.warning(f"No SHA256 hash found in version info for ID: {model_version_id}")
            return None
        except Exception as e:
            logger.error(f"Error getting hash from Civitai: {e}")
            return None

    async def _get_model_version_name(self, model_version_id: str) -> Optional[str]:
        """Get model version name from Civitai API"""
        try:
            if not self._civitai_client:
                return None
                
            version_info = await self._civitai_client.get_model_version_info(model_version_id)
            
            if version_info and 'name' in version_info:
                return version_info['name']
                    
            logger.warning(f"No version name found for modelVersionId {model_version_id}")
            return None
        except Exception as e:
            logger.error(f"Error getting model version name from Civitai: {e}")
            return None

    async def _determine_base_model(self, loras: List[Dict]) -> Optional[str]:
        """Determine the most common base model among LoRAs"""
        base_models = {}
        
        # Count occurrences of each base model
        for lora in loras:
            if 'hash' in lora:
                lora_path = self._lora_scanner.get_lora_path_by_hash(lora['hash'])
                if lora_path:
                    base_model = await self._get_base_model_for_lora(lora_path)
                    if base_model:
                        base_models[base_model] = base_models.get(base_model, 0) + 1
        
        # Return the most common base model
        if base_models:
            return max(base_models.items(), key=lambda x: x[1])[0]
        return None

    async def _get_base_model_for_lora(self, lora_path: str) -> Optional[str]:
        """Get base model for a LoRA from cache"""
        try:
            if not self._lora_scanner:
                return None
            
            cache = await self._lora_scanner.get_cached_data()
            if not cache or not cache.raw_data:
                return None
            
            # Find matching lora in cache
            for lora in cache.raw_data:
                if lora.get('file_path') == lora_path:
                    return lora.get('base_model')
                
            return None
        except Exception as e:
            logger.error(f"Error getting base model for lora: {e}")
            return None

    async def get_paginated_data(self, page: int, page_size: int, sort_by: str = 'date', search: str = None, filters: dict = None, search_options: dict = None):
        """Get paginated and filtered recipe data
        
        Args:
            page: Current page number (1-based)
            page_size: Number of items per page
            sort_by: Sort method ('name' or 'date')
            search: Search term
            filters: Dictionary of filters to apply
            search_options: Dictionary of search options to apply
        """
        cache = await self.get_cached_data()

        # Get base dataset
        filtered_data = cache.sorted_by_date if sort_by == 'date' else cache.sorted_by_name
        
        # Apply search filter
        if search:
            # Default search options if none provided
            if not search_options:
                search_options = {
                    'title': True,
                    'tags': True,
                    'lora_name': True,
                    'lora_model': True
                }
            
            # Build the search predicate based on search options
            def matches_search(item):
                # Search in title if enabled
                if search_options.get('title', True):
                    if fuzzy_match(str(item.get('title', '')), search):
                        return True
                
                # Search in tags if enabled
                if search_options.get('tags', True) and 'tags' in item:
                    for tag in item['tags']:
                        if fuzzy_match(tag, search):
                            return True
                
                # Search in lora file names if enabled
                if search_options.get('lora_name', True) and 'loras' in item:
                    for lora in item['loras']:
                        if fuzzy_match(str(lora.get('file_name', '')), search):
                            return True
                
                # Search in lora model names if enabled
                if search_options.get('lora_model', True) and 'loras' in item:
                    for lora in item['loras']:
                        if fuzzy_match(str(lora.get('modelName', '')), search):
                            return True
                
                # No match found
                return False
            
            # Filter the data using the search predicate
            filtered_data = [item for item in filtered_data if matches_search(item)]
        
        # Apply additional filters
        if filters:
            # Filter by base model
            if 'base_model' in filters and filters['base_model']:
                filtered_data = [
                    item for item in filtered_data
                    if item.get('base_model', '') in filters['base_model']
                ]
            
            # Filter by tags
            if 'tags' in filters and filters['tags']:
                filtered_data = [
                    item for item in filtered_data
                    if any(tag in item.get('tags', []) for tag in filters['tags'])
                ]

        # Calculate pagination
        total_items = len(filtered_data)
        start_idx = (page - 1) * page_size
        end_idx = min(start_idx + page_size, total_items)
        
        # Get paginated items
        paginated_items = filtered_data[start_idx:end_idx]
        
        # Add inLibrary information for each lora
        for item in paginated_items:
            if 'loras' in item:
                for lora in item['loras']:
                    if 'hash' in lora and lora['hash']:
                        lora['inLibrary'] = self._lora_scanner.has_lora_hash(lora['hash'].lower())
                        lora['preview_url'] = self._lora_scanner.get_preview_url_by_hash(lora['hash'].lower())
                        lora['localPath'] = self._lora_scanner.get_lora_path_by_hash(lora['hash'].lower())
        
        result = {
            'items': paginated_items,
            'total': total_items,
            'page': page,
            'page_size': page_size,
            'total_pages': (total_items + page_size - 1) // page_size
        }
        
        return result
