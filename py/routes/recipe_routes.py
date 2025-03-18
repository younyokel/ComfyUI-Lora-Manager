import os
import logging
import sys
from aiohttp import web
from typing import Dict
import tempfile
import json
import aiohttp
import asyncio
from ..utils.exif_utils import ExifUtils
from ..services.civitai_client import CivitaiClient

from ..services.recipe_scanner import RecipeScanner
from ..services.lora_scanner import LoraScanner
from ..config import config
import time  # Add this import at the top

logger = logging.getLogger(__name__)
print("Recipe Routes module loaded", file=sys.stderr)

class RecipeRoutes:
    """API route handlers for Recipe management"""

    def __init__(self):
        print("Initializing RecipeRoutes", file=sys.stderr)
        self.recipe_scanner = RecipeScanner(LoraScanner())
        self.civitai_client = CivitaiClient()
        
        # Pre-warm the cache
        self._init_cache_task = None

    @classmethod
    def setup_routes(cls, app: web.Application):
        """Register API routes"""
        print("Setting up recipe routes", file=sys.stderr)
        routes = cls()
        app.router.add_get('/api/recipes', routes.get_recipes)
        app.router.add_get('/api/recipe/{recipe_id}', routes.get_recipe_detail)
        app.router.add_post('/api/recipes/analyze-image', routes.analyze_recipe_image)
        app.router.add_post('/api/recipes/save', routes.save_recipe)
        app.router.add_delete('/api/recipe/{recipe_id}', routes.delete_recipe)
        
        # Add new filter-related endpoints
        app.router.add_get('/api/recipes/top-tags', routes.get_top_tags)
        app.router.add_get('/api/recipes/base-models', routes.get_base_models)
        
        # Add new sharing endpoints
        app.router.add_get('/api/recipe/{recipe_id}/share', routes.share_recipe)
        app.router.add_get('/api/recipe/{recipe_id}/share/download', routes.download_shared_recipe)
        
        # Start cache initialization
        app.on_startup.append(routes._init_cache)
        
        print("Recipe routes setup complete", file=sys.stderr)
    
    async def _init_cache(self, app):
        """Initialize cache on startup"""
        print("Pre-warming recipe cache...", file=sys.stderr)
        try:
            # First, ensure the lora scanner is fully initialized
            print("Initializing lora scanner...", file=sys.stderr)
            lora_scanner = self.recipe_scanner._lora_scanner
            
            # Get lora cache to ensure it's initialized
            lora_cache = await lora_scanner.get_cached_data()
            print(f"Lora scanner initialized with {len(lora_cache.raw_data)} loras", file=sys.stderr)
            
            # Verify hash index is built
            if hasattr(lora_scanner, '_hash_index'):
                hash_index_size = len(lora_scanner._hash_index._hash_to_path) if hasattr(lora_scanner._hash_index, '_hash_to_path') else 0
                print(f"Lora hash index contains {hash_index_size} entries", file=sys.stderr)
            
            # Now that lora scanner is initialized, initialize recipe cache
            print("Initializing recipe cache...", file=sys.stderr)
            await self.recipe_scanner.get_cached_data(force_refresh=True)
            print("Recipe cache pre-warming complete", file=sys.stderr)
        except Exception as e:
            print(f"Error pre-warming recipe cache: {e}", file=sys.stderr)
            logger.error(f"Error pre-warming recipe cache: {e}", exc_info=True)
    
    async def get_recipes(self, request: web.Request) -> web.Response:
        """API endpoint for getting paginated recipes"""
        try:
            print("API: GET /api/recipes", file=sys.stderr)
            # Get query parameters with defaults
            page = int(request.query.get('page', '1'))
            page_size = int(request.query.get('page_size', '20'))
            sort_by = request.query.get('sort_by', 'date')
            search = request.query.get('search', None)
            
            # Get filter parameters
            base_models = request.query.get('base_models', None)
            tags = request.query.get('tags', None)
            
            # Parse filter parameters
            filters = {}
            if base_models:
                filters['base_model'] = base_models.split(',')
            if tags:
                filters['tags'] = tags.split(',')
            
            # Get paginated data
            result = await self.recipe_scanner.get_paginated_data(
                page=page,
                page_size=page_size,
                sort_by=sort_by,
                search=search,
                filters=filters
            )
            
            # Format the response data with static URLs for file paths
            for item in result['items']:
                # Always ensure file_url is set
                if 'file_path' in item:
                    item['file_url'] = self._format_recipe_file_url(item['file_path'])
                else:
                    item['file_url'] = '/loras_static/images/no-preview.png'
                
                # 确保 loras 数组存在
                if 'loras' not in item:
                    item['loras'] = []
                    
                # 确保有 base_model 字段
                if 'base_model' not in item:
                    item['base_model'] = ""
            
            return web.json_response(result)
        except Exception as e:
            logger.error(f"Error retrieving recipes: {e}", exc_info=True)
            print(f"API Error: {e}", file=sys.stderr)
            return web.json_response({"error": str(e)}, status=500)

    async def get_recipe_detail(self, request: web.Request) -> web.Response:
        """Get detailed information about a specific recipe"""
        try:
            recipe_id = request.match_info['recipe_id']
            
            # Get all recipes from cache
            cache = await self.recipe_scanner.get_cached_data()
            
            # Find the specific recipe
            recipe = next((r for r in cache.raw_data if str(r.get('id', '')) == recipe_id), None)
            
            if not recipe:
                return web.json_response({"error": "Recipe not found"}, status=404)
            
            # Format recipe data
            formatted_recipe = self._format_recipe_data(recipe)
            
            return web.json_response(formatted_recipe)
        except Exception as e:
            logger.error(f"Error retrieving recipe details: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)
    
    def _format_recipe_file_url(self, file_path: str) -> str:
        """Format file path for recipe image as a URL"""
        try:
            # Return the file URL directly for the first lora root's preview
            recipes_dir = os.path.join(config.loras_roots[0], "recipes").replace(os.sep, '/')
            if file_path.replace(os.sep, '/').startswith(recipes_dir):
                relative_path = os.path.relpath(file_path, config.loras_roots[0]).replace(os.sep, '/')
                return f"/loras_static/root1/preview/{relative_path}" 
            
            # If not in recipes dir, try to create a valid URL from the file path
            file_name = os.path.basename(file_path)
            return f"/loras_static/root1/preview/recipes/{file_name}"
        except Exception as e:
            logger.error(f"Error formatting recipe file URL: {e}", exc_info=True)
            return '/loras_static/images/no-preview.png'  # Return default image on error
    
    def _format_recipe_data(self, recipe: Dict) -> Dict:
        """Format recipe data for API response"""
        formatted = {**recipe}  # Copy all fields
        
        # Format file paths to URLs
        if 'file_path' in formatted:
            formatted['file_url'] = self._format_recipe_file_url(formatted['file_path'])
        
        # Format dates for display
        for date_field in ['created_date', 'modified']:
            if date_field in formatted:
                formatted[f"{date_field}_formatted"] = self._format_timestamp(formatted[date_field])
        
        return formatted
    
    def _format_timestamp(self, timestamp: float) -> str:
        """Format timestamp for display"""
        from datetime import datetime
        return datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S') 

    async def analyze_recipe_image(self, request: web.Request) -> web.Response:
        """Analyze an uploaded image for recipe metadata"""
        temp_path = None
        try:
            reader = await request.multipart()
            field = await reader.next()
            
            if field.name != 'image':
                return web.json_response({
                    "error": "No image field found",
                    "loras": []
                }, status=400)
            
            # Create a temporary file to store the uploaded image
            with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp_file:
                while True:
                    chunk = await field.read_chunk()
                    if not chunk:
                        break
                    temp_file.write(chunk)
                temp_path = temp_file.name
            
            # Extract metadata from the image using ExifUtils
            user_comment = ExifUtils.extract_user_comment(temp_path)
            
            # If no metadata found, return a more specific error
            if not user_comment:
                return web.json_response({
                    "error": "No metadata found in this image",
                    "loras": []  # Return empty loras array to prevent client-side errors
                }, status=200)  # Return 200 instead of 400 to handle gracefully
            
            # Parse the recipe metadata
            metadata = ExifUtils.parse_recipe_metadata(user_comment)
            
            # Look for Civitai resources in the metadata
            civitai_resources = metadata.get('loras', [])
            checkpoint = metadata.get('checkpoint')
            
            if not civitai_resources and not checkpoint:
                return web.json_response({
                    "error": "No LoRA information found in this image",
                    "loras": []  # Return empty loras array
                }, status=200)  # Return 200 instead of 400
            
            # Process the resources to get LoRA information
            loras = []
            base_model = None
            
            # Process LoRAs and collect base models
            base_model_counts = {}
            loras = []
            
            # Process LoRAs
            for resource in civitai_resources:
                # Get model version ID
                model_version_id = resource.get('modelVersionId')
                if not model_version_id:
                    continue
                
                # Get additional info from Civitai
                civitai_info = await self.civitai_client.get_model_version_info(model_version_id)

                # Initialize lora entry with default values
                lora_entry = {
                    'id': model_version_id,
                    'name': resource.get('modelName', ''),
                    'version': resource.get('modelVersionName', ''),
                    'type': resource.get('type', 'lora'),
                    'weight': resource.get('weight', 1.0),
                    'existsLocally': False,
                    'localPath': None,
                    'file_name': '',
                    'hash': '',
                    'thumbnailUrl': '',
                    'baseModel': '',
                    'size': 0,
                    'downloadUrl': '',
                    'isDeleted': False  # New flag to indicate if the LoRA is deleted from Civitai
                }
                
                # Check if this LoRA exists locally by SHA256 hash
                if civitai_info and civitai_info.get("error") != "Model not found":
                    # LoRA exists on Civitai, process its information
                    if 'files' in civitai_info:
                        # Find the model file (type="Model") in the files list
                        model_file = next((file for file in civitai_info.get('files', []) 
                                          if file.get('type') == 'Model'), None)
                        
                        if model_file:
                            sha256 = model_file.get('hashes', {}).get('SHA256', '')
                            if sha256:
                                exists_locally = self.recipe_scanner._lora_scanner.has_lora_hash(sha256)
                                if exists_locally:
                                    local_path = self.recipe_scanner._lora_scanner.get_lora_path_by_hash(sha256)
                                    lora_entry['existsLocally'] = True
                                    lora_entry['localPath'] = local_path
                                    lora_entry['file_name'] = os.path.splitext(os.path.basename(local_path))[0]
                                else:
                                    # For missing LoRAs, get file_name from model_file.name
                                    file_name = model_file.get('name', '')
                                    lora_entry['file_name'] = os.path.splitext(file_name)[0] if file_name else ''
                            
                            lora_entry['hash'] = sha256
                            lora_entry['size'] = model_file.get('sizeKB', 0) * 1024
                    
                    # Get thumbnail URL from first image
                    if 'images' in civitai_info and civitai_info['images']:
                        lora_entry['thumbnailUrl'] = civitai_info['images'][0].get('url', '')
                    
                    # Get base model and update counts
                    current_base_model = civitai_info.get('baseModel', '')
                    lora_entry['baseModel'] = current_base_model
                    if current_base_model:
                        base_model_counts[current_base_model] = base_model_counts.get(current_base_model, 0) + 1
                    
                    # Get download URL
                    lora_entry['downloadUrl'] = civitai_info.get('downloadUrl', '')
                else:
                    # LoRA is deleted from Civitai or not found
                    lora_entry['isDeleted'] = True
                    lora_entry['thumbnailUrl'] = '/loras_static/images/no-preview.png'
                
                loras.append(lora_entry)
            
            # Set base_model to the most common one from civitai_info
            if base_model_counts:
                base_model = max(base_model_counts.items(), key=lambda x: x[1])[0]
            
            # Extract generation parameters for recipe metadata
            gen_params = {
                'prompt': metadata.get('prompt', ''),
                'negative_prompt': metadata.get('negative_prompt', ''),
                'checkpoint': checkpoint,
                'steps': metadata.get('steps', ''),
                'sampler': metadata.get('sampler', ''),
                'cfg_scale': metadata.get('cfg_scale', ''),
                'seed': metadata.get('seed', ''),
                'size': metadata.get('size', ''),
                'clip_skip': metadata.get('clip_skip', '')
            }
            
            return web.json_response({
                'base_model': base_model,
                'loras': loras,
                'gen_params': gen_params,
                'raw_metadata': metadata  # Include the raw metadata for saving
            })
            
        except Exception as e:
            logger.error(f"Error analyzing recipe image: {e}", exc_info=True)
            return web.json_response({
                "error": str(e),
                "loras": []  # Return empty loras array to prevent client-side errors
            }, status=500)
        finally:
            # Clean up the temporary file in the finally block
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except Exception as e:
                    logger.error(f"Error deleting temporary file: {e}")


    async def save_recipe(self, request: web.Request) -> web.Response:
        """Save a recipe to the recipes folder"""
        try:
            reader = await request.multipart()
            
            # Process form data
            image = None
            name = None
            tags = []
            metadata = None
            
            while True:
                field = await reader.next()
                if field is None:
                    break
                
                if field.name == 'image':
                    # Read image data
                    image_data = b''
                    while True:
                        chunk = await field.read_chunk()
                        if not chunk:
                            break
                        image_data += chunk
                    image = image_data
                    
                elif field.name == 'name':
                    name = await field.text()
                    
                elif field.name == 'tags':
                    tags_text = await field.text()
                    try:
                        tags = json.loads(tags_text)
                    except:
                        tags = []
                    
                elif field.name == 'metadata':
                    metadata_text = await field.text()
                    try:
                        metadata = json.loads(metadata_text)
                    except:
                        metadata = {}
            
            if not image or not name or not metadata:
                return web.json_response({"error": "Missing required fields"}, status=400)
            
            # Create recipes directory if it doesn't exist
            recipes_dir = self.recipe_scanner.recipes_dir
            os.makedirs(recipes_dir, exist_ok=True)
            
            # Generate UUID for the recipe
            import uuid
            recipe_id = str(uuid.uuid4())
            
            # Save the image
            image_ext = ".jpg"
            image_filename = f"{recipe_id}{image_ext}"
            image_path = os.path.join(recipes_dir, image_filename)
            with open(image_path, 'wb') as f:
                f.write(image)
            
            # Create the recipe JSON
            current_time = time.time()
            
            # Format loras data according to the recipe.json format
            loras_data = []
            for lora in metadata.get("loras", []):
                # Skip deleted LoRAs if they're marked to be excluded
                if lora.get("isDeleted", False) and lora.get("exclude", False):
                    continue
                
                # Convert frontend lora format to recipe format
                lora_entry = {
                    "file_name": lora.get("file_name", "") or os.path.splitext(os.path.basename(lora.get("localPath", "")))[0],
                    "hash": lora.get("hash", "").lower() if lora.get("hash") else "",
                    "strength": float(lora.get("weight", 1.0)),
                    "modelVersionId": lora.get("id", ""),
                    "modelName": lora.get("name", ""),
                    "modelVersionName": lora.get("version", ""),
                    "isDeleted": lora.get("isDeleted", False)  # Preserve deletion status in saved recipe
                }
                loras_data.append(lora_entry)
            
            # Format gen_params according to the recipe.json format
            gen_params = metadata.get("gen_params", {})
            if not gen_params and "raw_metadata" in metadata:
                # Extract from raw metadata if available
                raw_metadata = metadata.get("raw_metadata", {})
                gen_params = {
                    "prompt": raw_metadata.get("prompt", ""),
                    "negative_prompt": raw_metadata.get("negative_prompt", ""),
                    "checkpoint": raw_metadata.get("checkpoint", {}),
                    "steps": raw_metadata.get("steps", ""),
                    "sampler": raw_metadata.get("sampler", ""),
                    "cfg_scale": raw_metadata.get("cfg_scale", ""),
                    "seed": raw_metadata.get("seed", ""),
                    "size": raw_metadata.get("size", ""),
                    "clip_skip": raw_metadata.get("clip_skip", "")
                }
            
            # Create the recipe data structure
            recipe_data = {
                "id": recipe_id,
                "file_path": image_path,
                "title": name,
                "modified": current_time,
                "created_date": current_time,
                "base_model": metadata.get("base_model", ""),
                "loras": loras_data,
                "gen_params": gen_params
            }
            
            # Add tags if provided
            if tags:
                recipe_data["tags"] = tags
            
            # Save the recipe JSON
            json_filename = f"{recipe_id}.recipe.json"
            json_path = os.path.join(recipes_dir, json_filename)
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(recipe_data, f, indent=4, ensure_ascii=False)
            
            # Simplified cache update approach
            # Instead of trying to update the cache directly, just set it to None
            # to force a refresh on the next get_cached_data call
            if self.recipe_scanner._cache is not None:
                # Add the recipe to the raw data if the cache exists
                # This is a simple direct update without locks or timeouts
                self.recipe_scanner._cache.raw_data.append(recipe_data)
                # Schedule a background task to resort the cache
                asyncio.create_task(self.recipe_scanner._cache.resort())
                logger.info(f"Added recipe {recipe_id} to cache")
            
            return web.json_response({
                'success': True,
                'recipe_id': recipe_id,
                'image_path': image_path,
                'json_path': json_path
            })
            
        except Exception as e:
            logger.error(f"Error saving recipe: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500) 

    async def delete_recipe(self, request: web.Request) -> web.Response:
        """Delete a recipe by ID"""
        try:
            recipe_id = request.match_info['recipe_id']
            
            # Get recipes directory
            recipes_dir = self.recipe_scanner.recipes_dir
            if not recipes_dir or not os.path.exists(recipes_dir):
                return web.json_response({"error": "Recipes directory not found"}, status=404)
            
            # Find recipe JSON file
            recipe_json_path = os.path.join(recipes_dir, f"{recipe_id}.recipe.json")
            if not os.path.exists(recipe_json_path):
                return web.json_response({"error": "Recipe not found"}, status=404)
            
            # Load recipe data to get image path
            with open(recipe_json_path, 'r', encoding='utf-8') as f:
                recipe_data = json.load(f)
            
            # Get image path
            image_path = recipe_data.get('file_path')
            
            # Delete recipe JSON file
            os.remove(recipe_json_path)
            logger.info(f"Deleted recipe JSON file: {recipe_json_path}")
            
            # Delete recipe image if it exists
            if image_path and os.path.exists(image_path):
                os.remove(image_path)
                logger.info(f"Deleted recipe image: {image_path}")
            
            # Simplified cache update approach
            if self.recipe_scanner._cache is not None:
                # Remove the recipe from raw_data if it exists
                self.recipe_scanner._cache.raw_data = [
                    r for r in self.recipe_scanner._cache.raw_data 
                    if str(r.get('id', '')) != recipe_id
                ]
                # Schedule a background task to resort the cache
                asyncio.create_task(self.recipe_scanner._cache.resort())
                logger.info(f"Removed recipe {recipe_id} from cache")
            
            return web.json_response({"success": True, "message": "Recipe deleted successfully"})
        except Exception as e:
            logger.error(f"Error deleting recipe: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500) 

    async def get_top_tags(self, request: web.Request) -> web.Response:
        """Get top tags used in recipes"""
        try:
            # Get limit parameter with default
            limit = int(request.query.get('limit', '20'))
            
            # Get all recipes from cache
            cache = await self.recipe_scanner.get_cached_data()
            
            # Count tag occurrences
            tag_counts = {}
            for recipe in cache.raw_data:
                if 'tags' in recipe and recipe['tags']:
                    for tag in recipe['tags']:
                        tag_counts[tag] = tag_counts.get(tag, 0) + 1
            
            # Sort tags by count and limit results
            sorted_tags = [{'tag': tag, 'count': count} for tag, count in tag_counts.items()]
            sorted_tags.sort(key=lambda x: x['count'], reverse=True)
            top_tags = sorted_tags[:limit]
            
            return web.json_response({
                'success': True,
                'tags': top_tags
            })
        except Exception as e:
            logger.error(f"Error retrieving top tags: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)
    
    async def get_base_models(self, request: web.Request) -> web.Response:
        """Get base models used in recipes"""
        try:
            # Get all recipes from cache
            cache = await self.recipe_scanner.get_cached_data()
            
            # Count base model occurrences
            base_model_counts = {}
            for recipe in cache.raw_data:
                if 'base_model' in recipe and recipe['base_model']:
                    base_model = recipe['base_model']
                    base_model_counts[base_model] = base_model_counts.get(base_model, 0) + 1
            
            # Sort base models by count
            sorted_models = [{'name': model, 'count': count} for model, count in base_model_counts.items()]
            sorted_models.sort(key=lambda x: x['count'], reverse=True)
            
            return web.json_response({
                'success': True,
                'base_models': sorted_models
            })
        except Exception as e:
            logger.error(f"Error retrieving base models: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500) 

    async def share_recipe(self, request: web.Request) -> web.Response:
        """Process a recipe image for sharing by adding metadata to EXIF"""
        try:
            recipe_id = request.match_info['recipe_id']
            
            # Get all recipes from cache
            cache = await self.recipe_scanner.get_cached_data()
            
            # Find the specific recipe
            recipe = next((r for r in cache.raw_data if str(r.get('id', '')) == recipe_id), None)
            
            if not recipe:
                return web.json_response({"error": "Recipe not found"}, status=404)
            
            # Get the image path
            image_path = recipe.get('file_path')
            if not image_path or not os.path.exists(image_path):
                return web.json_response({"error": "Recipe image not found"}, status=404)
            
            # Create a temporary copy of the image to modify
            import tempfile
            import shutil
            
            # Create temp file with same extension
            ext = os.path.splitext(image_path)[1]
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as temp_file:
                temp_path = temp_file.name
            
            # Copy the original image to temp file
            shutil.copy2(image_path, temp_path)
            
            # Add recipe metadata to the image
            from ..utils.exif_utils import ExifUtils
            processed_path = ExifUtils.append_recipe_metadata(temp_path, recipe)
            
            # Create a URL for the processed image
            # Use a timestamp to prevent caching
            timestamp = int(time.time())
            filename = os.path.basename(processed_path)
            url_path = f"/api/recipe/{recipe_id}/share/download?t={timestamp}"
            
            # Store the temp path in a dictionary to serve later
            if not hasattr(self, '_shared_recipes'):
                self._shared_recipes = {}
            
            self._shared_recipes[recipe_id] = {
                'path': processed_path,
                'timestamp': timestamp,
                'expires': time.time() + 300  # Expire after 5 minutes
            }
            
            # Clean up old entries
            self._cleanup_shared_recipes()
            
            return web.json_response({
                'success': True,
                'download_url': url_path,
                'filename': f"recipe_{recipe.get('title', '').replace(' ', '_').lower()}{ext}"
            })
        except Exception as e:
            logger.error(f"Error sharing recipe: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def download_shared_recipe(self, request: web.Request) -> web.Response:
        """Serve a processed recipe image for download"""
        try:
            recipe_id = request.match_info['recipe_id']
            
            # Check if we have this shared recipe
            if not hasattr(self, '_shared_recipes') or recipe_id not in self._shared_recipes:
                return web.json_response({"error": "Shared recipe not found or expired"}, status=404)
            
            shared_info = self._shared_recipes[recipe_id]
            file_path = shared_info['path']
            
            if not os.path.exists(file_path):
                return web.json_response({"error": "Shared recipe file not found"}, status=404)
            
            # Get recipe to determine filename
            cache = await self.recipe_scanner.get_cached_data()
            recipe = next((r for r in cache.raw_data if str(r.get('id', '')) == recipe_id), None)
            
            # Set filename for download
            filename = f"recipe_{recipe.get('title', '').replace(' ', '_').lower() if recipe else recipe_id}"
            ext = os.path.splitext(file_path)[1]
            download_filename = f"{filename}{ext}"
            
            # Serve the file
            return web.FileResponse(
                file_path,
                headers={
                    'Content-Disposition': f'attachment; filename="{download_filename}"'
                }
            )
        except Exception as e:
            logger.error(f"Error downloading shared recipe: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    def _cleanup_shared_recipes(self):
        """Clean up expired shared recipes"""
        if not hasattr(self, '_shared_recipes'):
            return
        
        current_time = time.time()
        expired_ids = [rid for rid, info in self._shared_recipes.items() 
                      if current_time > info.get('expires', 0)]
        
        for rid in expired_ids:
            try:
                # Delete the temporary file
                file_path = self._shared_recipes[rid]['path']
                if os.path.exists(file_path):
                    os.unlink(file_path)
                
                # Remove from dictionary
                del self._shared_recipes[rid]
            except Exception as e:
                logger.error(f"Error cleaning up shared recipe {rid}: {e}") 