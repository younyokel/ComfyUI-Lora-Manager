import os
import logging
import asyncio
import json
import re
from typing import List, Dict, Optional, Any
from datetime import datetime
from ..config import config
from .recipe_cache import RecipeCache
from .lora_scanner import LoraScanner
from .civitai_client import CivitaiClient
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
            if lora_scanner:
                self._lora_scanner = lora_scanner
            self._initialized = True
    
    @property
    def recipes_dir(self) -> str:
        """Get path to recipes directory"""
        if not config.loras_roots:
            return ""
        
        # config.loras_roots already sorted case-insensitively, use the first one
        recipes_dir = os.path.join(config.loras_roots[0], "recipes")
        os.makedirs(recipes_dir, exist_ok=True)
        logger.info(f"Using recipes directory: {recipes_dir}")
        
        return recipes_dir
    
    async def get_cached_data(self, force_refresh: bool = False) -> RecipeCache:
        """Get cached recipe data, refresh if needed"""
        async with self._initialization_lock:
            
            # If cache is unitialized but needs to respond to request, return empty cache
            if self._cache is None and not force_refresh:
                return RecipeCache(
                    raw_data=[],
                    sorted_by_name=[],
                    sorted_by_date=[]
                )

            # If initializing, wait for completion
            if self._initialization_task and not self._initialization_task.done():
                try:
                    await self._initialization_task
                except Exception as e:
                    logger.error(f"Recipe cache initialization failed: {e}")
                    self._initialization_task = None
            
            if (self._cache is None or force_refresh):
                
                # Create new initialization task
                if not self._initialization_task or self._initialization_task.done():
                    # First ensure the lora scanner is initialized
                    if self._lora_scanner:
                        await self._lora_scanner.get_cached_data()
                        
                    self._initialization_task = asyncio.create_task(self._initialize_cache())
                
                try:
                    await self._initialization_task
                except Exception as e:
                    logger.error(f"Recipe cache initialization failed: {e}")
                    # If cache already exists, continue using old cache
                    if self._cache is None:
                        raise  # If no cache, raise exception
            
            return self._cache
    
    async def _initialize_cache(self) -> None:
        """Initialize or refresh the cache"""
        try:
            # Ensure lora scanner is fully initialized first
            if self._lora_scanner:
                logger.info("Recipe Manager: Waiting for lora scanner initialization to complete")
                
                # Get the lora cache to ensure it's initialized
                lora_cache = await self._lora_scanner.get_cached_data()
                logger.info(f"Recipe Manager: Lora scanner initialized with {len(lora_cache.raw_data)} loras")
                
                # Verify hash index is built
                if hasattr(self._lora_scanner, '_hash_index'):
                    hash_index_size = len(self._lora_scanner._hash_index._hash_to_path) if hasattr(self._lora_scanner._hash_index, '_hash_to_path') else 0
                    logger.info(f"Recipe Manager: Lora hash index contains {hash_index_size} entries")
                else:
                    logger.warning("Recipe Manager: No lora hash index available")
            else:
                logger.warning("Recipe Manager: No lora scanner available")
            
            # Scan for recipe data
            raw_data = await self.scan_all_recipes()
            
            # Update cache
            self._cache = RecipeCache(
                raw_data=raw_data,
                sorted_by_name=[],
                sorted_by_date=[]
            )
            
            # Resort cache
            await self._cache.resort()

            self._initialization_task = None
            logger.info("Recipe Manager: Cache initialization completed")
        except Exception as e:
            logger.error(f"Recipe Manager: Error initializing cache: {e}", exc_info=True)
            self._cache = RecipeCache(
                raw_data=[],
                sorted_by_name=[],
                sorted_by_date=[]
            )
    
    async def scan_all_recipes(self) -> List[Dict]:
        """Scan all recipe JSON files and return metadata"""
        recipes = []
        recipes_dir = self.recipes_dir
        
        if not recipes_dir or not os.path.exists(recipes_dir):
            logger.warning(f"Recipes directory not found: {recipes_dir}")
            return recipes
        
        # Get all recipe JSON files in the recipes directory
        recipe_files = []
        logger.info(f"Scanning for recipe JSON files in {recipes_dir}")
        for root, _, files in os.walk(recipes_dir):
            recipe_count = sum(1 for f in files if f.lower().endswith('.recipe.json'))
            if recipe_count > 0:
                logger.info(f"Found {recipe_count} recipe files in {root}")
                for file in files:
                    if file.lower().endswith('.recipe.json'):
                        recipe_files.append(os.path.join(root, file))
        
        # Process each recipe file
        for recipe_path in recipe_files:
            recipe_data = await self._load_recipe_file(recipe_path)
            if recipe_data:
                recipes.append(recipe_data)
                logger.info(f"Processed recipe: {recipe_data.get('title')}")
        
        logger.info(f"Successfully processed {len(recipes)} recipes")
        
        return recipes
    
    async def _load_recipe_file(self, recipe_path: str) -> Optional[Dict]:
        """Load recipe data from a JSON file"""
        try:
            logger.info(f"Loading recipe file: {recipe_path}")
            
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
                    logger.info(f"Found alternative image path: {alternative_path}")
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
    
    def _create_basic_recipe_data(self, image_path: str) -> Dict:
        """Create basic recipe data from file information"""
        file_name = os.path.basename(image_path)
        title = os.path.splitext(file_name)[0]
        
        return {
            'file_path': image_path.replace(os.sep, '/'),
            'title': title,
            'file_name': file_name,
            'modified': os.path.getmtime(image_path),
            'created_date': os.path.getctime(image_path),
            'loras': []
        }
    
    def _extract_created_date(self, user_comment: str) -> Optional[float]:
        """Extract creation date from UserComment if present"""
        try:
            # Look for Created Date pattern
            created_date_match = re.search(r'Created Date: ([^,}]+)', user_comment)
            if created_date_match:
                date_str = created_date_match.group(1).strip()
                # Parse ISO format date
                dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                return dt.timestamp()
        except Exception as e:
            logger.error(f"Error extracting creation date: {e}")
        
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
            logger.info(f"Processing LoRA: {lora.get('modelName', 'Unknown')}, ID: {lora.get('modelVersionId', 'No ID')}")
            
            # Skip if already has complete information
            if 'hash' in lora and 'file_name' in lora and lora['file_name']:
                logger.info(f"LoRA already has complete information")
                continue
                
            # If has modelVersionId but no hash, look in lora cache first, then fetch from Civitai
            if 'modelVersionId' in lora and not lora.get('hash'):
                model_version_id = lora['modelVersionId']
                logger.info(f"Looking up hash for modelVersionId: {model_version_id}")
                
                # Try to find in lora cache first
                hash_from_cache = await self._find_hash_in_lora_cache(model_version_id)
                if hash_from_cache:
                    logger.info(f"Found hash in lora cache: {hash_from_cache}")
                    lora['hash'] = hash_from_cache
                    metadata_updated = True
                else:
                    # If not in cache, fetch from Civitai
                    logger.info(f"Fetching hash from Civitai for {model_version_id}")
                    hash_from_civitai = await self._get_hash_from_civitai(model_version_id)
                    if hash_from_civitai:
                        logger.info(f"Got hash from Civitai: {hash_from_civitai}")
                        lora['hash'] = hash_from_civitai
                        metadata_updated = True
                    else:
                        logger.warning(f"Could not get hash for modelVersionId {model_version_id}")
            
            # If has hash but no file_name, look up in lora library
            if 'hash' in lora and (not lora.get('file_name') or not lora['file_name']):
                hash_value = lora['hash']
                logger.info(f"Looking up file_name for hash: {hash_value}")
                
                if self._lora_scanner.has_lora_hash(hash_value):
                    lora_path = self._lora_scanner.get_lora_path_by_hash(hash_value)
                    if lora_path:
                        file_name = os.path.splitext(os.path.basename(lora_path))[0]
                        logger.info(f"Found lora in library: {file_name}")
                        lora['file_name'] = file_name
                        metadata_updated = True
                else:
                    # Lora not in library
                    logger.info(f"LoRA with hash {hash_value} not found in library")
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
                
            logger.info(f"Fetching model version info from Civitai for ID: {model_version_id}")
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
    
    async def _update_recipe_metadata(self, recipe_data: Dict) -> bool:
        """Update recipe metadata with missing information
        
        Returns:
            bool: True if metadata was updated
        """
        metadata_updated = False
        
        # Update lora information
        for lora in recipe_data.get('loras', []):
            # First check if modelVersionId exists and hash doesn't
            if 'modelVersionId' in lora and not lora.get('hash'):
                model_version_id = str(lora['modelVersionId'])
                # Try to find hash in lora cache first
                hash_from_cache = await self._find_hash_in_lora_cache(model_version_id)
                if hash_from_cache:
                    logger.info(f"Found hash in cache for modelVersionId {model_version_id}")
                    lora['hash'] = hash_from_cache.lower()  # Standardize to lowercase
                    metadata_updated = True
                else:
                    # If not in cache, fetch from Civitai
                    logger.info(f"Fetching hash from Civitai for {model_version_id}")
                    hash_from_civitai = await self._get_hash_from_civitai(model_version_id)
                    if hash_from_civitai:
                        logger.info(f"Got hash from Civitai")
                        lora['hash'] = hash_from_civitai.lower()  # Standardize to lowercase
                        metadata_updated = True
                    else:
                        logger.warning(f"Could not get hash for modelVersionId {model_version_id}")
            
            # If modelVersionId exists but no modelVersionName, try to get it from Civitai
            if 'modelVersionId' in lora and not lora.get('modelVersionName'):
                model_version_id = str(lora['modelVersionId'])
                model_version_name = await self._get_model_version_name(model_version_id)
                if model_version_name:
                    lora['modelVersionName'] = model_version_name
                    metadata_updated = True
            
            # If has hash, check if it's in library
            if 'hash' in lora:
                hash_value = lora['hash'].lower()  # Ensure lowercase when comparing
                in_library = self._lora_scanner.has_lora_hash(hash_value)
                lora['inLibrary'] = in_library
                
                # If hash is in library but no file_name, look up and set file_name
                if in_library and (not lora.get('file_name') or not lora['file_name']):
                    lora_path = self._lora_scanner.get_lora_path_by_hash(hash_value)
                    if lora_path:
                        file_name = os.path.splitext(os.path.basename(lora_path))[0]
                        logger.info(f"Found lora in library: {file_name}")
                        lora['file_name'] = file_name
                        metadata_updated = True
                elif not in_library:
                    # Lora not in library
                    logger.info(f"LoRA with hash {hash_value[:8]}... not found in library")
                    lora['file_name'] = ''
                    metadata_updated = True
        
        # Determine the base_model for the recipe based on loras
        if recipe_data.get('loras') and not recipe_data.get('base_model'):
            base_model = await self._determine_base_model(recipe_data.get('loras', []))
            if base_model:
                recipe_data['base_model'] = base_model
                metadata_updated = True
        
        return metadata_updated

    async def _get_model_version_name(self, model_version_id: str) -> Optional[str]:
        """Get model version name from Civitai API"""
        try:
            if not self._civitai_client:
                return None
                
            logger.info(f"Fetching model version info from Civitai for ID: {model_version_id}")
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

    async def get_paginated_data(self, page: int, page_size: int, sort_by: str = 'date', search: str = None):
        """Get paginated and filtered recipe data
        
        Args:
            page: Current page number (1-based)
            page_size: Number of items per page
            sort_by: Sort method ('name' or 'date')
            search: Search term
        """
        cache = await self.get_cached_data()

        # Get base dataset
        filtered_data = cache.sorted_by_date if sort_by == 'date' else cache.sorted_by_name
        
        # Apply search filter
        if search:
            filtered_data = [
                item for item in filtered_data 
                if search.lower() in str(item.get('title', '')).lower() or
                   search.lower() in str(item.get('prompt', '')).lower()
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
        
        result = {
            'items': paginated_items,
            'total': total_items,
            'page': page,
            'page_size': page_size,
            'total_pages': (total_items + page_size - 1) // page_size
        }
        
        return result 