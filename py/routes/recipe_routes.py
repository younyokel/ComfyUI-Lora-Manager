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
        
        # Start cache initialization
        app.on_startup.append(routes._init_cache)
        
        print("Recipe routes setup complete", file=sys.stderr)
    
    async def _init_cache(self, app):
        """Initialize cache on startup"""
        print("Pre-warming recipe cache...", file=sys.stderr)
        try:
            # Diagnose lora scanner first
            await self.recipe_scanner._lora_scanner.diagnose_hash_index()
            
            # Force a cache refresh
            await self.recipe_scanner.get_cached_data(force_refresh=True)
            print("Recipe cache pre-warming complete", file=sys.stderr)
        except Exception as e:
            print(f"Error pre-warming recipe cache: {e}", file=sys.stderr)
    
    async def get_recipes(self, request: web.Request) -> web.Response:
        """API endpoint for getting paginated recipes"""
        try:
            print("API: GET /api/recipes", file=sys.stderr)
            # Get query parameters with defaults
            page = int(request.query.get('page', '1'))
            page_size = int(request.query.get('page_size', '20'))
            sort_by = request.query.get('sort_by', 'date')
            search = request.query.get('search', None)
            
            # Get paginated data
            result = await self.recipe_scanner.get_paginated_data(
                page=page,
                page_size=page_size,
                sort_by=sort_by,
                search=search
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
            
            # Set base model from checkpoint if available
            if checkpoint:
                base_model = checkpoint.get('modelName', '')
            
            # Process LoRAs
            for resource in civitai_resources:
                # Get model version ID
                model_version_id = resource.get('modelVersionId')
                if not model_version_id:
                    continue
                
                # Get additional info from Civitai
                civitai_info = await self.civitai_client.get_model_version_info(model_version_id)

                # Check if this LoRA exists locally by SHA256 hash
                exists_locally = False
                local_path = None
                
                if civitai_info and 'files' in civitai_info:
                    # Find the model file (type="Model") in the files list
                    model_file = next((file for file in civitai_info.get('files', []) 
                                      if file.get('type') == 'Model'), None)
                    
                    if model_file:
                        sha256 = model_file.get('hashes', {}).get('SHA256', '')
                        if sha256:
                            exists_locally = self.recipe_scanner._lora_scanner.has_lora_hash(sha256)
                            if exists_locally:
                                local_path = self.recipe_scanner._lora_scanner.get_lora_path_by_hash(sha256)
                
                # Create LoRA entry
                lora_entry = {
                    'id': model_version_id,
                    'name': resource.get('modelName', ''),
                    'version': resource.get('modelVersionName', ''),
                    'type': resource.get('type', 'lora'),
                    'weight': resource.get('weight', 1.0),
                    'existsLocally': exists_locally,
                    'localPath': local_path,
                    'thumbnailUrl': '',
                    'baseModel': '',
                    'size': 0,
                    'downloadUrl': ''
                }
                
                # Add Civitai info if available
                if civitai_info:
                    # Get thumbnail URL from first image
                    if 'images' in civitai_info and civitai_info['images']:
                        lora_entry['thumbnailUrl'] = civitai_info['images'][0].get('url', '')
                    
                    # Get base model
                    lora_entry['baseModel'] = civitai_info.get('baseModel', '')
                    
                    # Get file size from model file
                    if model_file:
                        lora_entry['size'] = model_file.get('sizeKB', 0) * 1024
                    
                    # Get download URL
                    lora_entry['downloadUrl'] = civitai_info.get('downloadUrl', '')
                
                loras.append(lora_entry)
            
            return web.json_response({
                'base_model': base_model,
                'loras': loras
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
            recipe_data = {
                "id": recipe_id,
                "file_path": image_path,
                "title": name,
                "modified": current_time,
                "created_date": current_time,
                "base_model": metadata.get("base_model", ""),
                "loras": metadata.get("loras", []),
                "gen_params": metadata.get("gen_params", {})
            }
            
            # Add tags if provided
            if tags:
                recipe_data["tags"] = tags
            
            # Save the recipe JSON
            json_filename = f"{recipe_id}.recipe.json"
            json_path = os.path.join(recipes_dir, json_filename)
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(recipe_data, f, indent=4, ensure_ascii=False)
            # Force refresh the recipe cache
            await self.recipe_scanner.get_cached_data(force_refresh=True)
            return web.json_response({
                'success': True,
                'recipe_id': recipe_id,
                'image_path': image_path,
                'json_path': json_path
            })
            
        except Exception as e:
            logger.error(f"Error saving recipe: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500) 