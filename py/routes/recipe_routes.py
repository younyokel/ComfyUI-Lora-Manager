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
        app.router.add_post('/api/recipes/download-missing-loras', routes.download_missing_loras)
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
            print(f"User comment: {user_comment}", file=sys.stderr)
            
            # If no metadata found, return a more specific error
            if not user_comment:
                return web.json_response({
                    "error": "No metadata found in this image",
                    "loras": []  # Return empty loras array to prevent client-side errors
                }, status=200)  # Return 200 instead of 400 to handle gracefully
            
            # Parse the recipe metadata
            metadata = ExifUtils.parse_recipe_metadata(user_comment)
            print(f"Metadata: {metadata}", file=sys.stderr)
            
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
                print(f"Civitai info: {civitai_info}", file=sys.stderr)

                # Check if this LoRA exists locally by SHA256 hash
                exists_locally = False
                local_path = ""
                
                if civitai_info and 'files' in civitai_info and civitai_info['files']:
                    sha256 = civitai_info['files'][0].get('hashes', {}).get('SHA256', '')
                    if sha256:
                        sha256 = sha256.lower()  # Convert to lowercase for consistency
                        exists_locally = self.recipe_scanner._lora_scanner.has_lora_hash(sha256)
                        if exists_locally:
                            local_path = self.recipe_scanner._lora_scanner.get_lora_path_by_hash(sha256) or ""
                
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
                    
                    # Get file size
                    if 'files' in civitai_info and civitai_info['files']:
                        lora_entry['size'] = civitai_info['files'][0].get('sizeKB', 0) * 1024
                    
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

    async def download_missing_loras(self, request: web.Request) -> web.Response:
        """Download missing LoRAs for a recipe"""
        try:
            data = await request.json()
            loras = data.get('loras', [])
            lora_root = data.get('lora_root', '')
            relative_path = data.get('relative_path', '')
            
            if not loras:
                return web.json_response({"error": "No LoRAs specified"}, status=400)
            
            if not lora_root:
                return web.json_response({"error": "No LoRA root directory specified"}, status=400)
            
            # Create target directory if it doesn't exist
            target_dir = os.path.join(lora_root, relative_path) if relative_path else lora_root
            os.makedirs(target_dir, exist_ok=True)
            
            # Download each LoRA
            downloaded = []
            for lora in loras:
                download_url = lora.get('downloadUrl')
                if not download_url:
                    continue
                
                # Generate filename from LoRA name
                filename = f"{lora.get('name', 'lora')}.safetensors"
                filename = filename.replace(' ', '_').replace('/', '_').replace('\\', '_')
                
                # Download the file
                target_path = os.path.join(target_dir, filename)
                
                async with aiohttp.ClientSession() as session:
                    async with session.get(download_url, allow_redirects=True) as response:
                        if response.status != 200:
                            continue
                        
                        with open(target_path, 'wb') as f:
                            while True:
                                chunk = await response.content.read(1024 * 1024)  # 1MB chunks
                                if not chunk:
                                    break
                                f.write(chunk)
                
                downloaded.append({
                    'id': lora.get('id'),
                    'localPath': target_path
                })
            
            return web.json_response({
                'downloaded': downloaded
            })
            
        except Exception as e:
            logger.error(f"Error downloading missing LoRAs: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def save_recipe(self, request: web.Request) -> web.Response:
        """Save a recipe to the recipes folder"""
        try:
            reader = await request.multipart()
            
            # Process form data
            image = None
            name = None
            tags = []
            recipe_data = None
            
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
                    
                elif field.name == 'recipe_data':
                    recipe_data_text = await field.text()
                    try:
                        recipe_data = json.loads(recipe_data_text)
                    except:
                        recipe_data = {}
            
            if not image or not name or not recipe_data:
                return web.json_response({"error": "Missing required fields"}, status=400)
            
            # Create recipes directory if it doesn't exist
            recipes_dir = os.path.join(config.loras_roots[0], "recipes")
            os.makedirs(recipes_dir, exist_ok=True)
            
            # Generate filename from recipe name
            filename = f"{name}.jpg"
            filename = filename.replace(' ', '_').replace('/', '_').replace('\\', '_')
            
            # Ensure filename is unique
            counter = 1
            base_name, ext = os.path.splitext(filename)
            while os.path.exists(os.path.join(recipes_dir, filename)):
                filename = f"{base_name}_{counter}{ext}"
                counter += 1
            
            # Save the image
            target_path = os.path.join(recipes_dir, filename)
            with open(target_path, 'wb') as f:
                f.write(image)
            
            # Add metadata to the image
            from PIL import Image
            from PIL.ExifTags import TAGS
            from piexif import dump, load
            import piexif.helper
            
            # Prepare metadata
            metadata = {
                'recipe_name': name,
                'recipe_tags': json.dumps(tags),
                'recipe_data': json.dumps(recipe_data),
                'created_date': str(time.time())
            }
            
            # Write metadata to image
            img = Image.open(target_path)
            exif_dict = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}
            
            for key, value in metadata.items():
                exif_dict["0th"][piexif.ImageIFD.XPComment] = piexif.helper.UserComment.dump(
                    json.dumps({key: value})
                )
            
            exif_bytes = dump(exif_dict)
            img.save(target_path, exif=exif_bytes)
            
            # Force refresh the recipe cache
            await self.recipe_scanner.get_cached_data(force_refresh=True)
            
            return web.json_response({
                'success': True,
                'file_path': target_path
            })
            
        except Exception as e:
            logger.error(f"Error saving recipe: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500) 