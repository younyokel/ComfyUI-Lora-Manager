import logging
import os
import re
import sys
import subprocess
from aiohttp import web
from ..services.settings_manager import settings
from ..utils.constants import SUPPORTED_MEDIA_EXTENSIONS

logger = logging.getLogger(__name__)

class ExampleImagesFileManager:
    """Manages access and operations for example image files"""
    
    @staticmethod
    async def open_folder(request):
        """
        Open the example images folder for a specific model
        
        Expects a JSON request body with:
        {
            "model_hash": "sha256_hash"  # SHA256 hash of the model
        }
        """
        try:
            # Parse request body
            data = await request.json()
            model_hash = data.get('model_hash')
            
            if not model_hash:
                return web.json_response({
                    'success': False,
                    'error': 'Missing model_hash parameter'
                }, status=400)
            
            # Get example images path from settings
            example_images_path = settings.get('example_images_path')
            if not example_images_path:
                return web.json_response({
                    'success': False,
                    'error': 'No example images path configured. Please set it in the settings panel first.'
                }, status=400)
            
            # Construct folder path for this model
            model_folder = os.path.join(example_images_path, model_hash)
            
            # Check if folder exists
            if not os.path.exists(model_folder):
                return web.json_response({
                    'success': False,
                    'error': 'No example images found for this model. Download example images first.'
                }, status=404)
            
            # Open folder in file explorer
            if os.name == 'nt':  # Windows
                os.startfile(model_folder)
            elif os.name == 'posix':  # macOS and Linux
                if sys.platform == 'darwin':  # macOS
                    subprocess.Popen(['open', model_folder])
                else:  # Linux
                    subprocess.Popen(['xdg-open', model_folder])
            
            return web.json_response({
                'success': True,
                'message': f'Opened example images folder for model {model_hash}'
            })
            
        except Exception as e:
            logger.error(f"Failed to open example images folder: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)

    @staticmethod
    async def get_files(request):
        """
        Get the list of example image files for a specific model
        
        Expects:
        - model_hash in query parameters
        
        Returns:
        - List of image files and their paths
        """
        try:
            # Get model_hash from query parameters
            model_hash = request.query.get('model_hash')
            
            if not model_hash:
                return web.json_response({
                    'success': False,
                    'error': 'Missing model_hash parameter'
                }, status=400)
            
            # Get example images path from settings
            example_images_path = settings.get('example_images_path')
            if not example_images_path:
                return web.json_response({
                    'success': False,
                    'error': 'No example images path configured'
                }, status=400)
            
            # Construct folder path for this model
            model_folder = os.path.join(example_images_path, model_hash)
            
            # Check if folder exists
            if not os.path.exists(model_folder):
                return web.json_response({
                    'success': False, 
                    'error': 'No example images found for this model',
                    'files': []
                }, status=404)
            
            # Get list of files in the folder
            files = []
            for file in os.listdir(model_folder):
                file_path = os.path.join(model_folder, file)
                if os.path.isfile(file_path):
                    # Check if file is a supported media file
                    file_ext = os.path.splitext(file)[1].lower()
                    if (file_ext in SUPPORTED_MEDIA_EXTENSIONS['images'] or 
                        file_ext in SUPPORTED_MEDIA_EXTENSIONS['videos']):
                        files.append({
                            'name': file,
                            'path': f'/example_images_static/{model_hash}/{file}',
                            'extension': file_ext,
                            'is_video': file_ext in SUPPORTED_MEDIA_EXTENSIONS['videos']
                        })
            
            # Check if files use 1-based indexing (look for patterns like "image_1.jpg")
            has_one_based = any(re.match(r'image_1\.\w+$', f['name']) for f in files)
            has_zero_based = any(re.match(r'image_0\.\w+$', f['name']) for f in files)
            
            # If there are 1-based indices and no 0-based indices, rename files
            if has_one_based and not has_zero_based:
                logger.info(f"Converting 1-based to 0-based indexing in {model_folder}")
                # Sort files to ensure correct order
                files.sort(key=lambda x: x['name'])
                
                # First, create rename mapping to avoid conflicts
                renames = []
                for file in files:
                    match = re.match(r'image_(\d+)\.(\w+)$', file['name'])
                    if match:
                        index = int(match.group(1))
                        ext = match.group(2)
                        if index > 0:  # Only rename if index is positive
                            new_name = f"image_{index-1}.{ext}"
                            renames.append((file['name'], new_name))
                
                # Use temporary filenames to avoid conflicts
                for old_name, new_name in renames:
                    old_path = os.path.join(model_folder, old_name)
                    temp_path = os.path.join(model_folder, f"temp_{old_name}")
                    try:
                        os.rename(old_path, temp_path)
                    except Exception as e:
                        logger.error(f"Failed to rename {old_path} to {temp_path}: {e}")
                
                # Rename from temporary names to final names
                for old_name, new_name in renames:
                    temp_path = os.path.join(model_folder, f"temp_{old_name}")
                    new_path = os.path.join(model_folder, new_name)
                    try:
                        os.rename(temp_path, new_path)
                        logger.debug(f"Renamed {old_name} to {new_name}")
                        
                        # Update file list entry
                        for file in files:
                            if file['name'] == old_name:
                                file['name'] = new_name
                                file['path'] = f'/example_images_static/{model_hash}/{new_name}'
                    except Exception as e:
                        logger.error(f"Failed to rename {temp_path} to {new_path}: {e}")
                
                # Refresh file list after renaming
                files = []
                for file in os.listdir(model_folder):
                    file_path = os.path.join(model_folder, file)
                    if os.path.isfile(file_path):
                        file_ext = os.path.splitext(file)[1].lower()
                        if (file_ext in SUPPORTED_MEDIA_EXTENSIONS['images'] or 
                            file_ext in SUPPORTED_MEDIA_EXTENSIONS['videos']):
                            files.append({
                                'name': file,
                                'path': f'/example_images_static/{model_hash}/{file}',
                                'extension': file_ext,
                                'is_video': file_ext in SUPPORTED_MEDIA_EXTENSIONS['videos']
                            })
            
            # Sort files by index for consistent order
            def extract_index(filename):
                match = re.match(r'image_(\d+)\.\w+$', filename)
                if match:
                    return int(match.group(1))
                return float('inf')  # Place non-matching files at the end
            
            files.sort(key=lambda x: extract_index(x['name']))
            
            return web.json_response({
                'success': True,
                'files': files
            })
            
        except Exception as e:
            logger.error(f"Failed to get example image files: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)
    
    @staticmethod
    async def has_images(request):
        """
        Check if the example images folder for a model exists and is not empty
        
        Expects:
        - model_hash in query parameters
        
        Returns:
        - Boolean indicating whether the folder exists and contains images/videos
        """
        try:
            # Get model_hash from query parameters
            model_hash = request.query.get('model_hash')
            
            if not model_hash:
                return web.json_response({
                    'success': False,
                    'error': 'Missing model_hash parameter'
                }, status=400)
            
            # Get example images path from settings
            example_images_path = settings.get('example_images_path')
            if not example_images_path:
                return web.json_response({
                    'has_images': False
                })
            
            # Construct folder path for this model
            model_folder = os.path.join(example_images_path, model_hash)
            
            # Check if folder exists
            if not os.path.exists(model_folder) or not os.path.isdir(model_folder):
                return web.json_response({
                    'has_images': False
                })
            
            # Check if folder contains any supported media files
            for file in os.listdir(model_folder):
                file_path = os.path.join(model_folder, file)
                if os.path.isfile(file_path):
                    file_ext = os.path.splitext(file)[1].lower()
                    if (file_ext in SUPPORTED_MEDIA_EXTENSIONS['images'] or 
                        file_ext in SUPPORTED_MEDIA_EXTENSIONS['videos']):
                        return web.json_response({
                            'has_images': True
                        })
            
            # If reached here, folder exists but has no supported media files
            return web.json_response({
                'has_images': False
            })
            
        except Exception as e:
            logger.error(f"Failed to check example images folder: {e}", exc_info=True)
            return web.json_response({
                'has_images': False,
                'error': str(e)
            })