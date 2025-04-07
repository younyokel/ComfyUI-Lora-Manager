import os
import time
import logging
from aiohttp import web
from typing import Dict
import tempfile
import json
import asyncio
from ..utils.exif_utils import ExifUtils
from ..utils.recipe_parsers import RecipeParserFactory
from ..services.civitai_client import CivitaiClient

from ..services.recipe_scanner import RecipeScanner
from ..services.lora_scanner import LoraScanner
from ..config import config
from ..workflow.parser import WorkflowParser
from ..utils.utils import download_civitai_image

logger = logging.getLogger(__name__)

class RecipeRoutes:
    """API route handlers for Recipe management"""

    def __init__(self):
        self.recipe_scanner = RecipeScanner(LoraScanner())
        self.civitai_client = CivitaiClient()
        self.parser = WorkflowParser()
        
        # Pre-warm the cache
        self._init_cache_task = None

    @classmethod
    def setup_routes(cls, app: web.Application):
        """Register API routes"""
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
        
        # Add new endpoint for getting recipe syntax
        app.router.add_get('/api/recipe/{recipe_id}/syntax', routes.get_recipe_syntax)
        
        # Add new endpoint for updating recipe metadata (name and tags)
        app.router.add_put('/api/recipe/{recipe_id}/update', routes.update_recipe)
        
        # Add new endpoint for reconnecting deleted LoRAs
        app.router.add_post('/api/recipe/lora/reconnect', routes.reconnect_lora)
        
        # Start cache initialization
        app.on_startup.append(routes._init_cache)
        
        app.router.add_post('/api/recipes/save-from-widget', routes.save_recipe_from_widget)
        
        # Add route to get recipes for a specific Lora
        app.router.add_get('/api/recipes/for-lora', routes.get_recipes_for_lora)
    
    async def _init_cache(self, app):
        """Initialize cache on startup"""
        try:
            # First, ensure the lora scanner is fully initialized
            lora_scanner = self.recipe_scanner._lora_scanner
            
            # Get lora cache to ensure it's initialized
            lora_cache = await lora_scanner.get_cached_data()
            
            # Verify hash index is built
            if hasattr(lora_scanner, '_hash_index'):
                hash_index_size = len(lora_scanner._hash_index._hash_to_path) if hasattr(lora_scanner._hash_index, '_hash_to_path') else 0
            
            # Now that lora scanner is initialized, initialize recipe cache
            await self.recipe_scanner.get_cached_data(force_refresh=True)
        except Exception as e:
            logger.error(f"Error pre-warming recipe cache: {e}", exc_info=True)
    
    async def get_recipes(self, request: web.Request) -> web.Response:
        """API endpoint for getting paginated recipes"""
        try:
            # Get query parameters with defaults
            page = int(request.query.get('page', '1'))
            page_size = int(request.query.get('page_size', '20'))
            sort_by = request.query.get('sort_by', 'date')
            search = request.query.get('search', None)
            
            # Get search options (renamed for better clarity)
            search_title = request.query.get('search_title', 'true').lower() == 'true'
            search_tags = request.query.get('search_tags', 'true').lower() == 'true'  
            search_lora_name = request.query.get('search_lora_name', 'true').lower() == 'true'
            search_lora_model = request.query.get('search_lora_model', 'true').lower() == 'true'
            
            # Get filter parameters
            base_models = request.query.get('base_models', None)
            tags = request.query.get('tags', None)
            
            # New parameter: get LoRA hash filter
            lora_hash = request.query.get('lora_hash', None)
            bypass_filters = request.query.get('bypass_filters', 'false').lower() == 'true'
            
            # Parse filter parameters
            filters = {}
            if base_models:
                filters['base_model'] = base_models.split(',')
            if tags:
                filters['tags'] = tags.split(',')
            
            # Add search options to filters
            search_options = {
                'title': search_title,
                'tags': search_tags,
                'lora_name': search_lora_name,
                'lora_model': search_lora_model
            }

            # Get paginated data with the new lora_hash parameter
            result = await self.recipe_scanner.get_paginated_data(
                page=page,
                page_size=page_size,
                sort_by=sort_by,
                search=search,
                filters=filters,
                search_options=search_options,
                lora_hash=lora_hash,
                bypass_filters=bypass_filters
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
            return web.json_response({"error": str(e)}, status=500)

    async def get_recipe_detail(self, request: web.Request) -> web.Response:
        """Get detailed information about a specific recipe"""
        try:
            recipe_id = request.match_info['recipe_id']
            
            # Use the new get_recipe_by_id method from recipe_scanner
            recipe = await self.recipe_scanner.get_recipe_by_id(recipe_id)
            
            if not recipe:
                return web.json_response({"error": "Recipe not found"}, status=404)
            
            return web.json_response(recipe)
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
        """Analyze an uploaded image or URL for recipe metadata"""
        temp_path = None
        try:
            # Check if request contains multipart data (image) or JSON data (url)
            content_type = request.headers.get('Content-Type', '')
            
            is_url_mode = False
            
            if 'multipart/form-data' in content_type:
                # Handle image upload
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
                    
            elif 'application/json' in content_type:
                # Handle URL input
                data = await request.json()
                url = data.get('url')
                is_url_mode = True
                
                if not url:
                    return web.json_response({
                        "error": "No URL provided",
                        "loras": []
                    }, status=400)
                
                # Download image from URL
                temp_path = download_civitai_image(url)
                
                if not temp_path:
                    return web.json_response({
                        "error": "Failed to download image from URL",
                        "loras": []
                    }, status=400)
            
            # Extract metadata from the image using ExifUtils
            metadata = ExifUtils.extract_image_metadata(temp_path)
            
            # If no metadata found, return a more specific error
            if not metadata:
                result = {
                    "error": "No metadata found in this image",
                    "loras": []  # Return empty loras array to prevent client-side errors
                }
                
                # For URL mode, include the image data as base64
                if is_url_mode and temp_path:
                    import base64
                    with open(temp_path, "rb") as image_file:
                        result["image_base64"] = base64.b64encode(image_file.read()).decode('utf-8')
                    
                return web.json_response(result, status=200)
            
            # Use the parser factory to get the appropriate parser
            parser = RecipeParserFactory.create_parser(metadata)

            if parser is None:
                result = {
                    "error": "No parser found for this image",
                    "loras": []  # Return empty loras array to prevent client-side errors
                }
                
                # For URL mode, include the image data as base64
                if is_url_mode and temp_path:
                    import base64
                    with open(temp_path, "rb") as image_file:
                        result["image_base64"] = base64.b64encode(image_file.read()).decode('utf-8')
                    
                return web.json_response(result, status=200)
            
            # Parse the metadata
            result = await parser.parse_metadata(
                metadata, 
                recipe_scanner=self.recipe_scanner, 
                civitai_client=self.civitai_client
            )
            
            # For URL mode, include the image data as base64
            if is_url_mode and temp_path:
                import base64
                with open(temp_path, "rb") as image_file:
                    result["image_base64"] = base64.b64encode(image_file.read()).decode('utf-8')
            
            # Check for errors
            if "error" in result and not result.get("loras"):
                return web.json_response(result, status=200)
            
            return web.json_response(result)
            
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
            image_base64 = None
            image_url = None
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
                    
                elif field.name == 'image_base64':
                    # Get base64 image data
                    image_base64 = await field.text()
                    
                elif field.name == 'image_url':
                    # Get image URL
                    image_url = await field.text()
                    
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
            
            missing_fields = []
            if not name:
                missing_fields.append("name")
            if not metadata:
                missing_fields.append("metadata")
            if missing_fields:
                return web.json_response({"error": f"Missing required fields: {', '.join(missing_fields)}"}, status=400)
            
            # Handle different image sources
            if not image:
                if image_base64:
                    # Convert base64 to binary
                    import base64
                    try:
                        # Remove potential data URL prefix
                        if ',' in image_base64:
                            image_base64 = image_base64.split(',', 1)[1]
                        image = base64.b64decode(image_base64)
                    except Exception as e:
                        return web.json_response({"error": f"Invalid base64 image data: {str(e)}"}, status=400)
                elif image_url:
                    # Download image from URL
                    temp_path = download_civitai_image(image_url)
                    if not temp_path:
                        return web.json_response({"error": "Failed to download image from URL"}, status=400)
                    
                    # Read the downloaded image
                    with open(temp_path, 'rb') as f:
                        image = f.read()
                    
                    # Clean up temp file
                    try:
                        os.unlink(temp_path)
                    except:
                        pass
                else:
                    return web.json_response({"error": "No image data provided"}, status=400)
            
            # Create recipes directory if it doesn't exist
            recipes_dir = self.recipe_scanner.recipes_dir
            os.makedirs(recipes_dir, exist_ok=True)
            
            # Generate UUID for the recipe
            import uuid
            recipe_id = str(uuid.uuid4())
            
            # Optimize the image (resize and convert to WebP)
            optimized_image, extension = ExifUtils.optimize_image(
                image_data=image,
                target_width=480,
                format='webp',
                quality=85,
                preserve_metadata=True
            )
            
            # Save the optimized image
            image_filename = f"{recipe_id}{extension}"
            image_path = os.path.join(recipes_dir, image_filename)
            with open(image_path, 'wb') as f:
                f.write(optimized_image)
            
            # Create the recipe JSON
            current_time = time.time()
            
            # Format loras data according to the recipe.json format
            loras_data = []
            for lora in metadata.get("loras", []):
                # Modified: Always include deleted LoRAs in the recipe metadata
                # Even if they're marked to be excluded, we still keep their identifying information
                # The exclude flag will only be used to determine if they should be included in recipe syntax
                
                # Convert frontend lora format to recipe format
                lora_entry = {
                    "file_name": lora.get("file_name", "") or os.path.splitext(os.path.basename(lora.get("localPath", "")))[0] if lora.get("localPath") else "",
                    "hash": lora.get("hash", "").lower() if lora.get("hash") else "",
                    "strength": float(lora.get("weight", 1.0)),
                    "modelVersionId": lora.get("id", ""),
                    "modelName": lora.get("name", ""),
                    "modelVersionName": lora.get("version", ""),
                    "isDeleted": lora.get("isDeleted", False),  # Preserve deletion status in saved recipe
                    "exclude": lora.get("exclude", False)  # Add exclude flag to the recipe
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

            # Add recipe metadata to the image
            ExifUtils.append_recipe_metadata(image_path, recipe_data)
            
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
            processed_path = temp_path
            
            # Create a URL for the processed image
            # Use a timestamp to prevent caching
            timestamp = int(time.time())
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

    async def save_recipe_from_widget(self, request: web.Request) -> web.Response:
        """Save a recipe from the LoRAs widget"""
        try:
            reader = await request.multipart()
            
            # Process form data
            workflow_json = None
            
            while True:
                field = await reader.next()
                if field is None:
                    break
                
                if field.name == 'workflow_json':
                    workflow_text = await field.text()
                    try:
                        workflow_json = json.loads(workflow_text)
                    except:
                        return web.json_response({"error": "Invalid workflow JSON"}, status=400)
            
            if not workflow_json:
                return web.json_response({"error": "Missing workflow JSON"}, status=400)
            
            # Find the latest image in the temp directory
            temp_dir = config.temp_directory
            image_files = []
            
            for file in os.listdir(temp_dir):
                if file.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                    file_path = os.path.join(temp_dir, file)
                    image_files.append((file_path, os.path.getmtime(file_path)))
            
            if not image_files:
                return web.json_response({"error": "No recent images found to use for recipe"}, status=400)
            
            # Sort by modification time (newest first)
            image_files.sort(key=lambda x: x[1], reverse=True)
            latest_image_path = image_files[0][0]
            
            # Parse the workflow to extract generation parameters and loras
            parsed_workflow = self.parser.parse_workflow(workflow_json)

            if not parsed_workflow:
                return web.json_response({"error": "Could not extract parameters from workflow"}, status=400)
            
            # Get the lora stack from the parsed workflow
            lora_stack = parsed_workflow.get("loras", "")
            
            # Parse the lora stack format: "<lora:name:strength> <lora:name2:strength2> ..."
            import re
            lora_matches = re.findall(r'<lora:([^:]+):([^>]+)>', lora_stack)
            
            # Check if any loras were found
            if not lora_matches:
                return web.json_response({"error": "No LoRAs found in the workflow"}, status=400)
            
            # Generate recipe name from the first 3 loras (or less if fewer are available)
            loras_for_name = lora_matches[:3]  # Take at most 3 loras for the name
            
            recipe_name_parts = []
            for lora_name, lora_strength in loras_for_name:
                # Get the basename without path or extension
                basename = os.path.basename(lora_name)
                basename = os.path.splitext(basename)[0]
                recipe_name_parts.append(f"{basename}:{lora_strength}")
            
            recipe_name = " ".join(recipe_name_parts)
            
            # Read the image
            with open(latest_image_path, 'rb') as f:
                image = f.read()
            
            # Create recipes directory if it doesn't exist
            recipes_dir = self.recipe_scanner.recipes_dir
            os.makedirs(recipes_dir, exist_ok=True)
            
            # Generate UUID for the recipe
            import uuid
            recipe_id = str(uuid.uuid4())
            
            # Optimize the image (resize and convert to WebP)
            optimized_image, extension = ExifUtils.optimize_image(
                image_data=image,
                target_width=480,
                format='webp',
                quality=85,
                preserve_metadata=True
            )
            
            # Save the optimized image
            image_filename = f"{recipe_id}{extension}"
            image_path = os.path.join(recipes_dir, image_filename)
            with open(image_path, 'wb') as f:
                f.write(optimized_image)
            
            # Format loras data from the lora stack
            loras_data = []
            
            for lora_name, lora_strength in lora_matches:
                try:
                    # Get lora info from scanner
                    lora_info = await self.recipe_scanner._lora_scanner.get_lora_info_by_name(lora_name)
                    
                    # Create lora entry
                    lora_entry = {
                        "file_name": lora_name,
                        "hash": lora_info.get("sha256", "").lower() if lora_info else "",
                        "strength": float(lora_strength),
                        "modelVersionId": lora_info.get("civitai", {}).get("id", "") if lora_info else "",
                        "modelName": lora_info.get("civitai", {}).get("model", {}).get("name", "") if lora_info else lora_name,
                        "modelVersionName": lora_info.get("civitai", {}).get("name", "") if lora_info else "",
                        "isDeleted": False
                    }
                    loras_data.append(lora_entry)
                except Exception as e:
                    logger.warning(f"Error processing LoRA {lora_name}: {e}")
            
            # Get base model from lora scanner for the available loras
            base_model_counts = {}
            for lora in loras_data:
                lora_info = await self.recipe_scanner._lora_scanner.get_lora_info_by_name(lora.get("file_name", ""))
                if lora_info and "base_model" in lora_info:
                    base_model = lora_info["base_model"]
                    base_model_counts[base_model] = base_model_counts.get(base_model, 0) + 1
            
            # Get most common base model
            most_common_base_model = ""
            if base_model_counts:
                most_common_base_model = max(base_model_counts.items(), key=lambda x: x[1])[0]
            
            # Create the recipe data structure
            recipe_data = {
                "id": recipe_id,
                "file_path": image_path,
                "title": recipe_name,  # Use generated recipe name
                "modified": time.time(),
                "created_date": time.time(),
                "base_model": most_common_base_model,
                "loras": loras_data,
                "checkpoint": parsed_workflow.get("checkpoint", ""),
                "gen_params": {key: value for key, value in parsed_workflow.items() 
                               if key not in ['checkpoint', 'loras']},
                "loras_stack": lora_stack  # Include the original lora stack string
            }
            
            # Save the recipe JSON
            json_filename = f"{recipe_id}.recipe.json"
            json_path = os.path.join(recipes_dir, json_filename)
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(recipe_data, f, indent=4, ensure_ascii=False)

            # Add recipe metadata to the image
            ExifUtils.append_recipe_metadata(image_path, recipe_data)
            
            # Update cache
            if self.recipe_scanner._cache is not None:
                # Add the recipe to the raw data if the cache exists
                self.recipe_scanner._cache.raw_data.append(recipe_data)
                # Schedule a background task to resort the cache
                asyncio.create_task(self.recipe_scanner._cache.resort())
                logger.info(f"Added recipe {recipe_id} to cache")
            
            return web.json_response({
                'success': True,
                'recipe_id': recipe_id,
                'image_path': image_path,
                'json_path': json_path,
                'recipe_name': recipe_name  # Include the generated recipe name in the response
            })
            
        except Exception as e:
            logger.error(f"Error saving recipe from widget: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def get_recipe_syntax(self, request: web.Request) -> web.Response:
        """Generate recipe syntax for LoRAs in the recipe, looking up proper file names using hash_index"""
        try:
            recipe_id = request.match_info['recipe_id']
            
            # Get all recipes from cache
            cache = await self.recipe_scanner.get_cached_data()
            
            # Find the specific recipe
            recipe = next((r for r in cache.raw_data if str(r.get('id', '')) == recipe_id), None)
            
            if not recipe:
                return web.json_response({"error": "Recipe not found"}, status=404)
            
            # Get the loras from the recipe
            loras = recipe.get('loras', [])
            
            if not loras:
                return web.json_response({"error": "No LoRAs found in this recipe"}, status=400)
            
            # Generate recipe syntax for all LoRAs that:
            # 1. Are in the library (not deleted) OR
            # 2. Are deleted but not marked for exclusion
            lora_syntax_parts = []
            
            # Access the hash_index from lora_scanner
            hash_index = self.recipe_scanner._lora_scanner._hash_index
            
            for lora in loras:
                # Skip loras that are deleted AND marked for exclusion
                if lora.get("isDeleted", False):
                    continue

                if not self.recipe_scanner._lora_scanner.has_lora_hash(lora.get("hash", "")):
                    continue
                
                # Get the strength
                strength = lora.get("strength", 1.0)
                
                # Try to find the actual file name for this lora
                file_name = None
                hash_value = lora.get("hash", "").lower()
                
                if hash_value and hasattr(hash_index, "_hash_to_path"):
                    # Look up the file path from the hash
                    file_path = hash_index._hash_to_path.get(hash_value)
                    
                    if file_path:
                        # Extract the file name without extension from the path
                        file_name = os.path.splitext(os.path.basename(file_path))[0]
                
                # If hash lookup failed, fall back to modelVersionId lookup
                if not file_name and lora.get("modelVersionId"):
                    # Search for files with matching modelVersionId
                    all_loras = await self.recipe_scanner._lora_scanner.get_cached_data()
                    for cached_lora in all_loras.raw_data:
                        if not cached_lora.get("civitai"):
                            continue
                        if cached_lora.get("civitai", {}).get("id") == lora.get("modelVersionId"):
                            file_name = os.path.splitext(os.path.basename(cached_lora["path"]))[0]
                            break
                
                # If all lookups failed, use the file_name from the recipe
                if not file_name:
                    file_name = lora.get("file_name", "unknown-lora")
                
                # Add to syntax parts
                lora_syntax_parts.append(f"<lora:{file_name}:{strength}>")
            
            # Join the LoRA syntax parts
            lora_syntax = " ".join(lora_syntax_parts)
            
            return web.json_response({
                'success': True,
                'syntax': lora_syntax
            })
        except Exception as e:
            logger.error(f"Error generating recipe syntax: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def update_recipe(self, request: web.Request) -> web.Response:
        """Update recipe metadata (name and tags)"""
        try:
            recipe_id = request.match_info['recipe_id']
            data = await request.json()
            
            # Validate required fields
            if 'title' not in data and 'tags' not in data:
                return web.json_response({
                    "error": "At least one field to update must be provided (title or tags)"
                }, status=400)
            
            # Use the recipe scanner's update method
            success = await self.recipe_scanner.update_recipe_metadata(recipe_id, data)
            
            if not success:
                return web.json_response({"error": "Recipe not found or update failed"}, status=404)
            
            return web.json_response({
                "success": True,
                "recipe_id": recipe_id,
                "updates": data
            })
        except Exception as e:
            logger.error(f"Error updating recipe: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def reconnect_lora(self, request: web.Request) -> web.Response:
        """Reconnect a deleted LoRA in a recipe to a local LoRA file"""
        try:
            # Parse request data
            data = await request.json()
            
            # Validate required fields
            required_fields = ['recipe_id', 'lora_data', 'target_name']
            for field in required_fields:
                if field not in data:
                    return web.json_response({
                        "error": f"Missing required field: {field}"
                    }, status=400)
            
            recipe_id = data['recipe_id']
            lora_data = data['lora_data']
            target_name = data['target_name']
            
            # Get recipe scanner
            scanner = self.recipe_scanner
            lora_scanner = scanner._lora_scanner
            
            # Check if recipe exists
            recipe_path = os.path.join(scanner.recipes_dir, f"{recipe_id}.recipe.json")
            if not os.path.exists(recipe_path):
                return web.json_response({"error": "Recipe not found"}, status=404)
                
            # Find target LoRA by name
            target_lora = await lora_scanner.get_lora_info_by_name(target_name)
            if not target_lora:
                return web.json_response({"error": f"Local LoRA not found with name: {target_name}"}, status=404)
                
            # Load recipe data
            with open(recipe_path, 'r', encoding='utf-8') as f:
                recipe_data = json.load(f)
                
            # Find the deleted LoRA in the recipe
            found = False
            updated_lora = None
            
            # Identification can be by hash, modelVersionId, or modelName
            for i, lora in enumerate(recipe_data.get('loras', [])):
                match_found = False
                
                # Try to match by available identifiers
                if 'hash' in lora and 'hash' in lora_data and lora['hash'] == lora_data['hash']:
                    match_found = True
                elif 'modelVersionId' in lora and 'modelVersionId' in lora_data and lora['modelVersionId'] == lora_data['modelVersionId']:
                    match_found = True
                elif 'modelName' in lora and 'modelName' in lora_data and lora['modelName'] == lora_data['modelName']:
                    match_found = True
                    
                if match_found:
                    # Update LoRA data
                    lora['isDeleted'] = False
                    lora['file_name'] = target_name
                    
                    # Update with information from the target LoRA
                    if 'sha256' in target_lora:
                        lora['hash'] = target_lora['sha256'].lower()
                    if target_lora.get("civitai"):
                        lora['modelName'] = target_lora['civitai']['model']['name']
                        lora['modelVersionName'] = target_lora['civitai']['name']
                        lora['modelVersionId'] = target_lora['civitai']['id']
                        
                    # Keep original fields for identification
                    
                    # Mark as found and store updated lora
                    found = True
                    updated_lora = dict(lora)  # Make a copy for response
                    break
                    
            if not found:
                return web.json_response({"error": "Could not find matching deleted LoRA in recipe"}, status=404)
                
            # Save updated recipe
            with open(recipe_path, 'w', encoding='utf-8') as f:
                json.dump(recipe_data, f, indent=4, ensure_ascii=False)

            updated_lora['inLibrary'] = True
            updated_lora['preview_url'] = target_lora['preview_url']
            updated_lora['localPath'] = target_lora['file_path']
                
            # Update in cache if it exists
            if scanner._cache is not None:
                for cache_item in scanner._cache.raw_data:
                    if cache_item.get('id') == recipe_id:
                        # Replace loras array with updated version
                        cache_item['loras'] = recipe_data['loras']
                        
                        # Resort the cache
                        asyncio.create_task(scanner._cache.resort())
                        break
                        
            # Update EXIF metadata if image exists
            image_path = recipe_data.get('file_path')
            if image_path and os.path.exists(image_path):
                from ..utils.exif_utils import ExifUtils
                ExifUtils.append_recipe_metadata(image_path, recipe_data)
                
            return web.json_response({
                "success": True,
                "recipe_id": recipe_id,
                "updated_lora": updated_lora
            })
            
        except Exception as e:
            logger.error(f"Error reconnecting LoRA: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def get_recipes_for_lora(self, request: web.Request) -> web.Response:
        """Get recipes that use a specific Lora"""
        try:
            lora_hash = request.query.get('hash')
            
            # Hash is required
            if not lora_hash:
                return web.json_response({'success': False, 'error': 'Lora hash is required'}, status=400)
            
            # Log the search parameters
            logger.info(f"Getting recipes for Lora by hash: {lora_hash}")
            
            # Get all recipes from cache
            cache = await self.recipe_scanner.get_cached_data()
            
            # Filter recipes that use this Lora by hash
            matching_recipes = []
            for recipe in cache.raw_data:
                # Check if any of the recipe's loras match this hash
                loras = recipe.get('loras', [])
                for lora in loras:
                    if lora.get('hash', '').lower() == lora_hash.lower():
                        matching_recipes.append(recipe)
                        break  # No need to check other loras in this recipe
            
            # Process the recipes similar to get_paginated_data to ensure all needed data is available
            for recipe in matching_recipes:
                # Add inLibrary information for each lora
                if 'loras' in recipe:
                    for lora in recipe['loras']:
                        if 'hash' in lora and lora['hash']:
                            lora['inLibrary'] = self.recipe_scanner._lora_scanner.has_lora_hash(lora['hash'].lower())
                            lora['preview_url'] = self.recipe_scanner._lora_scanner.get_preview_url_by_hash(lora['hash'].lower())
                            lora['localPath'] = self.recipe_scanner._lora_scanner.get_lora_path_by_hash(lora['hash'].lower())
                
                # Ensure file_url is set (needed by frontend)
                if 'file_path' in recipe:
                    recipe['file_url'] = self._format_recipe_file_url(recipe['file_path'])
                else:
                    recipe['file_url'] = '/loras_static/images/no-preview.png'
            
            return web.json_response({'success': True, 'recipes': matching_recipes})
        except Exception as e:
            logger.error(f"Error getting recipes for Lora: {str(e)}")
            return web.json_response({'success': False, 'error': str(e)}, status=500)
