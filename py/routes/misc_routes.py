import logging
import os
import asyncio
import json
import time
import aiohttp
import shutil
from server import PromptServer # type: ignore
from aiohttp import web
from ..services.settings_manager import settings
from ..utils.usage_stats import UsageStats
from ..services.service_registry import ServiceRegistry
from ..utils.exif_utils import ExifUtils
from ..utils.constants import EXAMPLE_IMAGE_WIDTH, SUPPORTED_MEDIA_EXTENSIONS
from ..services.civitai_client import CivitaiClient
from ..utils.routes_common import ModelRouteUtils

logger = logging.getLogger(__name__)

# Download status tracking
download_task = None
is_downloading = False
download_progress = {
    'total': 0,
    'completed': 0,
    'current_model': '',
    'status': 'idle',  # idle, running, paused, completed, error
    'errors': [],
    'last_error': None,
    'start_time': None,
    'end_time': None,
    'processed_models': set(),  # Track models that have been processed
    'refreshed_models': set()  # Track models that had metadata refreshed
}

class MiscRoutes:
    """Miscellaneous routes for various utility functions"""
    
    @staticmethod
    def setup_routes(app):
        """Register miscellaneous routes"""
        app.router.add_post('/api/settings', MiscRoutes.update_settings)
        
        # Add new route for clearing cache
        app.router.add_post('/api/clear-cache', MiscRoutes.clear_cache)

        # Usage stats routes
        app.router.add_post('/api/update-usage-stats', MiscRoutes.update_usage_stats)
        app.router.add_get('/api/get-usage-stats', MiscRoutes.get_usage_stats)
        
        # Example images download routes
        app.router.add_post('/api/download-example-images', MiscRoutes.download_example_images)
        app.router.add_get('/api/example-images-status', MiscRoutes.get_example_images_status)
        app.router.add_post('/api/pause-example-images', MiscRoutes.pause_example_images)
        app.router.add_post('/api/resume-example-images', MiscRoutes.resume_example_images)
        
        # Lora code update endpoint
        app.router.add_post('/api/update-lora-code', MiscRoutes.update_lora_code)
    
    @staticmethod
    async def clear_cache(request):
        """Clear all cache files from the cache folder"""
        try:
            # Get the cache folder path (relative to project directory)
            project_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            cache_folder = os.path.join(project_dir, 'cache')
            
            # Check if cache folder exists
            if not os.path.exists(cache_folder):
                logger.info("Cache folder does not exist, nothing to clear")
                return web.json_response({'success': True, 'message': 'No cache folder found'})
            
            # Get list of cache files before deleting for reporting
            cache_files = [f for f in os.listdir(cache_folder) if os.path.isfile(os.path.join(cache_folder, f))]
            deleted_files = []
            
            # Delete each .msgpack file in the cache folder
            for filename in cache_files:
                if filename.endswith('.msgpack'):
                    file_path = os.path.join(cache_folder, filename)
                    try:
                        os.remove(file_path)
                        deleted_files.append(filename)
                        logger.info(f"Deleted cache file: {filename}")
                    except Exception as e:
                        logger.error(f"Failed to delete {filename}: {e}")
                        return web.json_response({
                            'success': False,
                            'error': f"Failed to delete {filename}: {str(e)}"
                        }, status=500)
            
            # If we want to completely remove the cache folder too (optional, 
            # but we'll keep the folder structure in place here)
            # shutil.rmtree(cache_folder)
            
            return web.json_response({
                'success': True,
                'message': f"Successfully cleared {len(deleted_files)} cache files",
                'deleted_files': deleted_files
            })
            
        except Exception as e:
            logger.error(f"Error clearing cache files: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)

    @staticmethod
    async def update_settings(request):
        """Update application settings"""
        try:
            data = await request.json()
            
            # Validate and update settings
            for key, value in data.items():
                # Special handling for example_images_path - verify path exists
                if key == 'example_images_path' and value:
                    if not os.path.exists(value):
                        return web.json_response({
                            'success': False,
                            'error': f"Path does not exist: {value}"
                        })
                    
                    # Path changed - server restart required for new path to take effect
                    old_path = settings.get('example_images_path')
                    if old_path != value:
                        logger.info(f"Example images path changed to {value} - server restart required")
                
                # Save to settings
                settings.set(key, value)
            
            return web.json_response({'success': True})
        except Exception as e:
            logger.error(f"Error updating settings: {e}", exc_info=True)
            return web.Response(status=500, text=str(e))
    
    @staticmethod
    async def update_usage_stats(request):
        """
        Update usage statistics based on a prompt_id
        
        Expects a JSON body with:
        {
            "prompt_id": "string"
        }
        """
        try:
            # Parse the request body
            data = await request.json()
            prompt_id = data.get('prompt_id')
            
            if not prompt_id:
                return web.json_response({
                    'success': False,
                    'error': 'Missing prompt_id'
                }, status=400)
            
            # Call the UsageStats to process this prompt_id synchronously
            usage_stats = UsageStats()
            await usage_stats.process_execution(prompt_id)
            
            return web.json_response({
                'success': True
            })
            
        except Exception as e:
            logger.error(f"Failed to update usage stats: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)
    
    @staticmethod
    async def get_usage_stats(request):
        """Get current usage statistics"""
        try:
            usage_stats = UsageStats()
            stats = await usage_stats.get_stats()
            
            return web.json_response({
                'success': True,
                'data': stats
            })
            
        except Exception as e:
            logger.error(f"Failed to get usage stats: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)
    
    @staticmethod
    async def download_example_images(request):
        """
        Download example images for models from Civitai
        
        Expects a JSON body with:
        {
            "output_dir": "path/to/output",  # Base directory to save example images
            "optimize": true,                # Whether to optimize images (default: true)
            "model_types": ["lora", "checkpoint"], # Model types to process (default: both)
            "delay": 1.0                     # Delay between downloads to avoid rate limiting (default: 1.0)
        }
        """
        global download_task, is_downloading, download_progress
        
        if is_downloading:
            # Create a copy for JSON serialization
            response_progress = download_progress.copy()
            response_progress['processed_models'] = list(download_progress['processed_models'])
            response_progress['refreshed_models'] = list(download_progress['refreshed_models'])
            
            return web.json_response({
                'success': False,
                'error': 'Download already in progress',
                'status': response_progress
            }, status=400)
        
        try:
            # Parse the request body
            data = await request.json()
            output_dir = data.get('output_dir')
            optimize = data.get('optimize', True)
            model_types = data.get('model_types', ['lora', 'checkpoint'])
            delay = float(data.get('delay', 0.1)) # Default to 0.1 seconds
            
            if not output_dir:
                return web.json_response({
                    'success': False,
                    'error': 'Missing output_dir parameter'
                }, status=400)
            
            # Create the output directory
            os.makedirs(output_dir, exist_ok=True)
            
            # Initialize progress tracking
            download_progress['total'] = 0
            download_progress['completed'] = 0
            download_progress['current_model'] = ''
            download_progress['status'] = 'running'
            download_progress['errors'] = []
            download_progress['last_error'] = None
            download_progress['start_time'] = time.time()
            download_progress['end_time'] = None
            
            # Get the processed models list from a file if it exists
            progress_file = os.path.join(output_dir, '.download_progress.json')
            if os.path.exists(progress_file):
                try:
                    with open(progress_file, 'r', encoding='utf-8') as f:
                        saved_progress = json.load(f)
                        download_progress['processed_models'] = set(saved_progress.get('processed_models', []))
                        logger.info(f"Loaded previous progress, {len(download_progress['processed_models'])} models already processed")
                except Exception as e:
                    logger.error(f"Failed to load progress file: {e}")
                    download_progress['processed_models'] = set()
            else:
                download_progress['processed_models'] = set()
            
            # Start the download task
            is_downloading = True
            download_task = asyncio.create_task(
                MiscRoutes._download_all_example_images(
                    output_dir, 
                    optimize, 
                    model_types,
                    delay
                )
            )
            
            # Create a copy for JSON serialization
            response_progress = download_progress.copy()
            response_progress['processed_models'] = list(download_progress['processed_models'])
            response_progress['refreshed_models'] = list(download_progress['refreshed_models'])
            
            return web.json_response({
                'success': True,
                'message': 'Download started',
                'status': response_progress
            })
            
        except Exception as e:
            logger.error(f"Failed to start example images download: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)

    @staticmethod
    async def get_example_images_status(request):
        """Get the current status of example images download"""
        global download_progress
        
        # Create a copy of the progress dict with the set converted to a list for JSON serialization
        response_progress = download_progress.copy()
        response_progress['processed_models'] = list(download_progress['processed_models'])
        response_progress['refreshed_models'] = list(download_progress['refreshed_models'])
        
        return web.json_response({
            'success': True,
            'is_downloading': is_downloading,
            'status': response_progress
        })

    @staticmethod
    async def pause_example_images(request):
        """Pause the example images download"""
        global download_progress
        
        if not is_downloading:
            return web.json_response({
                'success': False,
                'error': 'No download in progress'
            }, status=400)
        
        download_progress['status'] = 'paused'
        
        return web.json_response({
            'success': True,
            'message': 'Download paused'
        })

    @staticmethod
    async def resume_example_images(request):
        """Resume the example images download"""
        global download_progress
        
        if not is_downloading:
            return web.json_response({
                'success': False,
                'error': 'No download in progress'
            }, status=400)
        
        if download_progress['status'] == 'paused':
            download_progress['status'] = 'running'
            
            return web.json_response({
                'success': True,
                'message': 'Download resumed'
            })
        else:
            return web.json_response({
                'success': False,
                'error': f"Download is in '{download_progress['status']}' state, cannot resume"
            }, status=400)

    @staticmethod
    async def _refresh_model_metadata(model_hash, model_name, scanner_type, scanner):
        """Refresh model metadata from CivitAI
        
        Args:
            model_hash: SHA256 hash of the model
            model_name: Name of the model (for logging)
            scanner_type: Type of scanner ('lora' or 'checkpoint')
            scanner: Scanner instance for this model type
            
        Returns:
            bool: True if metadata was successfully refreshed, False otherwise
        """
        global download_progress
        
        try:
            # Find the model in the scanner cache
            cache = await scanner.get_cached_data()
            model_data = None
            
            for item in cache.raw_data:
                if item.get('sha256') == model_hash:
                    model_data = item
                    break
            
            if not model_data:
                logger.warning(f"Model {model_name} with hash {model_hash} not found in cache")
                return False
            
            file_path = model_data.get('file_path')
            if not file_path:
                logger.warning(f"Model {model_name} has no file path")
                return False
            
            # Track that we're refreshing this model
            download_progress['refreshed_models'].add(model_hash)
            
            # Use ModelRouteUtils to refresh the metadata
            async def update_cache_func(old_path, new_path, metadata):
                return await scanner.update_single_model_cache(old_path, new_path, metadata)
            
            success = await ModelRouteUtils.fetch_and_update_model(
                model_hash, 
                file_path, 
                model_data,
                update_cache_func
            )
            
            if success:
                logger.info(f"Successfully refreshed metadata for {model_name}")
                return True
            else:
                logger.warning(f"Failed to refresh metadata for {model_name}")
                return False
                
        except Exception as e:
            error_msg = f"Error refreshing metadata for {model_name}: {str(e)}"
            logger.error(error_msg, exc_info=True)
            download_progress['errors'].append(error_msg)
            download_progress['last_error'] = error_msg
            return False
    
    @staticmethod
    async def _process_model_images(model_hash, model_name, model_images, model_dir, optimize, independent_session, delay):
        """Process and download images for a single model
        
        Args:
            model_hash: SHA256 hash of the model
            model_name: Name of the model
            model_images: List of image objects from CivitAI
            model_dir: Directory to save images to
            optimize: Whether to optimize images
            independent_session: aiohttp session for downloads
            delay: Delay between downloads
            
        Returns:
            bool: True if all images were processed successfully, False otherwise
        """
        global download_progress
        
        model_success = True
        
        for i, image in enumerate(model_images, 1):
            image_url = image.get('url')
            if not image_url:
                continue
            
            # Get image filename from URL
            image_filename = os.path.basename(image_url.split('?')[0])
            image_ext = os.path.splitext(image_filename)[1].lower()
            
            # Handle both images and videos
            is_image = image_ext in SUPPORTED_MEDIA_EXTENSIONS['images']
            is_video = image_ext in SUPPORTED_MEDIA_EXTENSIONS['videos']
            
            if not (is_image or is_video):
                logger.debug(f"Skipping unsupported file type: {image_filename}")
                continue
            
            save_filename = f"image_{i}{image_ext}"
            
            # Check if already downloaded
            save_path = os.path.join(model_dir, save_filename)
            if os.path.exists(save_path):
                logger.debug(f"File already exists: {save_path}")
                continue
            
            # Download the file
            try:
                logger.debug(f"Downloading {save_filename} for {model_name}")
                
                # Direct download using the independent session
                async with independent_session.get(image_url, timeout=60) as response:
                    if response.status == 200:
                        if is_image and optimize:
                            # For images, optimize if requested
                            image_data = await response.read()
                            optimized_data, ext = ExifUtils.optimize_image(
                                image_data, 
                                target_width=EXAMPLE_IMAGE_WIDTH, 
                                format='webp', 
                                quality=85, 
                                preserve_metadata=False
                            )
                            
                            # Update save filename if format changed
                            if ext == '.webp':
                                save_filename = os.path.splitext(save_filename)[0] + '.webp'
                                save_path = os.path.join(model_dir, save_filename)
                            
                            # Save the optimized image
                            with open(save_path, 'wb') as f:
                                f.write(optimized_data)
                        else:
                            # For videos or unoptimized images, save directly
                            with open(save_path, 'wb') as f:
                                async for chunk in response.content.iter_chunked(8192):
                                    if chunk:
                                        f.write(chunk)
                    elif response.status == 404:
                        error_msg = f"Failed to download file: {image_url}, status code: 404 - Model metadata might be stale"
                        logger.warning(error_msg)
                        download_progress['errors'].append(error_msg)
                        download_progress['last_error'] = error_msg
                        model_success = False  # Mark model as failed due to 404
                        # Return early to trigger metadata refresh attempt
                        return False, True  # (success, is_stale_metadata)
                    else:
                        error_msg = f"Failed to download file: {image_url}, status code: {response.status}"
                        logger.warning(error_msg)
                        download_progress['errors'].append(error_msg)
                        download_progress['last_error'] = error_msg
                        model_success = False  # Mark model as failed
                
                # Add a delay between downloads for remote files only
                await asyncio.sleep(delay)
            except Exception as e:
                error_msg = f"Error downloading file {image_url}: {str(e)}"
                logger.error(error_msg)
                download_progress['errors'].append(error_msg)
                download_progress['last_error'] = error_msg
                model_success = False  # Mark model as failed
        
        return model_success, False  # (success, is_stale_metadata)
    
    @staticmethod
    async def _process_local_example_images(model_file_path, model_file_name, model_name, model_dir, optimize):
        """Process local example images for a model
        
        Args:
            model_file_path: Path to the model file
            model_file_name: Filename of the model
            model_name: Name of the model
            model_dir: Directory to save processed images to
            optimize: Whether to optimize images
            
        Returns:
            bool: True if local images were processed successfully, False otherwise
        """
        global download_progress
        
        try:
            model_dir_path = os.path.dirname(model_file_path)
            local_images = []
            
            # Look for files with pattern: filename.example.*.ext
            if model_file_name:
                example_prefix = f"{model_file_name}.example."
                
                if os.path.exists(model_dir_path):
                    for file in os.listdir(model_dir_path):
                        file_lower = file.lower()
                        if file_lower.startswith(example_prefix.lower()):
                            file_ext = os.path.splitext(file_lower)[1]
                            is_supported = (file_ext in SUPPORTED_MEDIA_EXTENSIONS['images'] or 
                                           file_ext in SUPPORTED_MEDIA_EXTENSIONS['videos'])
                            
                            if is_supported:
                                local_images.append(os.path.join(model_dir_path, file))
            
            # Process local images if found
            if local_images:
                logger.info(f"Found {len(local_images)} local example images for {model_name}")
                
                for i, local_image_path in enumerate(local_images, 1):
                    local_ext = os.path.splitext(local_image_path)[1].lower()
                    save_filename = f"image_{i}{local_ext}"
                    save_path = os.path.join(model_dir, save_filename)
                    
                    # Skip if already exists in output directory
                    if os.path.exists(save_path):
                        logger.debug(f"File already exists in output: {save_path}")
                        continue
                    
                    # Handle image processing based on file type and optimize setting
                    is_image = local_ext in SUPPORTED_MEDIA_EXTENSIONS['images']
                    
                    if is_image and optimize:
                        # Optimize the image
                        with open(local_image_path, 'rb') as img_file:
                            image_data = img_file.read()
                        
                        optimized_data, ext = ExifUtils.optimize_image(
                            image_data, 
                            target_width=EXAMPLE_IMAGE_WIDTH, 
                            format='webp', 
                            quality=85, 
                            preserve_metadata=False
                        )
                        
                        # Update save filename if format changed
                        if ext == '.webp':
                            save_filename = os.path.splitext(save_filename)[0] + '.webp'
                            save_path = os.path.join(model_dir, save_filename)
                        
                        # Save the optimized image
                        with open(save_path, 'wb') as f:
                            f.write(optimized_data)
                    else:
                        # For videos or unoptimized images, copy directly
                        with open(local_image_path, 'rb') as src_file:
                            with open(save_path, 'wb') as dst_file:
                                dst_file.write(src_file.read())
                
                return True
            return False
        except Exception as e:
            error_msg = f"Error processing local examples for {model_name}: {str(e)}"
            logger.error(error_msg)
            download_progress['errors'].append(error_msg)
            download_progress['last_error'] = error_msg
            return False

    @staticmethod
    async def _download_all_example_images(output_dir, optimize, model_types, delay):
        """Download example images for all models
        
        Args:
            output_dir: Base directory to save example images
            optimize: Whether to optimize images
            model_types: List of model types to process
            delay: Delay between downloads to avoid rate limiting
        """
        global is_downloading, download_progress
        
        # Create an independent session for downloading example images
        # This avoids interference with the CivitAI client's session
        connector = aiohttp.TCPConnector(
            ssl=True,
            limit=3,
            force_close=False,
            enable_cleanup_closed=True
        )
        timeout = aiohttp.ClientTimeout(total=None, connect=60, sock_read=60)
        
        # Create a dedicated session just for this download task
        independent_session = aiohttp.ClientSession(
            connector=connector,
            trust_env=True,
            timeout=timeout
        )
        
        try:
            # Get the scanners
            scanners = []
            if 'lora' in model_types:
                lora_scanner = await ServiceRegistry.get_lora_scanner()
                scanners.append(('lora', lora_scanner))
            
            if 'checkpoint' in model_types:
                checkpoint_scanner = await ServiceRegistry.get_checkpoint_scanner()
                scanners.append(('checkpoint', checkpoint_scanner))
            
            # Get all models from all scanners
            all_models = []
            for scanner_type, scanner in scanners:
                cache = await scanner.get_cached_data()
                if cache and cache.raw_data:
                    for model in cache.raw_data:
                        # Only process models with images and a valid sha256
                        if model.get('civitai') and model.get('civitai', {}).get('images') and model.get('sha256'):
                            all_models.append((scanner_type, model, scanner))
            
            # Update total count
            download_progress['total'] = len(all_models)
            logger.info(f"Found {download_progress['total']} models with example images")
            
            # Process each model
            for scanner_type, model, scanner in all_models:
                # Check if download is paused
                while download_progress['status'] == 'paused':
                    await asyncio.sleep(1)
                
                # Check if download should continue
                if download_progress['status'] != 'running':
                    logger.info(f"Download stopped: {download_progress['status']}")
                    break
                
                model_hash = model.get('sha256', '').lower()
                model_name = model.get('model_name', 'Unknown')
                model_file_path = model.get('file_path', '')
                model_file_name = model.get('file_name', '')
                
                try:
                    # Update current model info
                    download_progress['current_model'] = f"{model_name} ({model_hash[:8]})"
                    
                    # Skip if already processed
                    if model_hash in download_progress['processed_models']:
                        logger.debug(f"Skipping already processed model: {model_name}")
                        download_progress['completed'] += 1
                        continue
                    
                    # Create model directory
                    model_dir = os.path.join(output_dir, model_hash)
                    os.makedirs(model_dir, exist_ok=True)
                    
                    # Process images for this model
                    images = model.get('civitai', {}).get('images', [])
                    
                    if not images:
                        logger.debug(f"No images found for model: {model_name}")
                        download_progress['processed_models'].add(model_hash)
                        download_progress['completed'] += 1
                        continue
                    
                    # First check if we have local example images for this model
                    local_images_processed = False
                    if model_file_path:
                        local_images_processed = await MiscRoutes._process_local_example_images(
                            model_file_path, 
                            model_file_name, 
                            model_name, 
                            model_dir, 
                            optimize
                        )
                        
                        if local_images_processed:
                            # Mark as successfully processed if all local images were processed
                            download_progress['processed_models'].add(model_hash)
                            logger.info(f"Successfully processed local examples for {model_name}")
                    
                    # If we didn't process local images, download from remote
                    if not local_images_processed:
                        # Try to download images
                        model_success, is_stale_metadata = await MiscRoutes._process_model_images(
                            model_hash, 
                            model_name, 
                            images, 
                            model_dir, 
                            optimize, 
                            independent_session, 
                            delay
                        )
                        
                        # If metadata is stale (404 error), try to refresh it and download again
                        if is_stale_metadata and model_hash not in download_progress['refreshed_models']:
                            logger.info(f"Metadata seems stale for {model_name}, attempting to refresh...")
                            
                            # Refresh metadata from CivitAI
                            refresh_success = await MiscRoutes._refresh_model_metadata(
                                model_hash, 
                                model_name, 
                                scanner_type, 
                                scanner
                            )
                            
                            if refresh_success:
                                # Get updated model data
                                updated_cache = await scanner.get_cached_data()
                                updated_model = None
                                
                                for item in updated_cache.raw_data:
                                    if item.get('sha256') == model_hash:
                                        updated_model = item
                                        break
                                
                                if updated_model and updated_model.get('civitai', {}).get('images'):
                                    # Try downloading with updated metadata
                                    logger.info(f"Retrying download with refreshed metadata for {model_name}")
                                    updated_images = updated_model.get('civitai', {}).get('images', [])
                                    
                                    # Retry download with new images
                                    model_success, _ = await MiscRoutes._process_model_images(
                                        model_hash, 
                                        model_name, 
                                        updated_images, 
                                        model_dir, 
                                        optimize, 
                                        independent_session, 
                                        delay
                                    )
                        
                        # Only mark model as processed if all images downloaded successfully
                        if model_success:
                            download_progress['processed_models'].add(model_hash)
                        else:
                            logger.warning(f"Model {model_name} had download errors, will not mark as completed")
                    
                    # Save progress to file periodically
                    if download_progress['completed'] % 10 == 0 or download_progress['completed'] == download_progress['total'] - 1:
                        progress_file = os.path.join(output_dir, '.download_progress.json')
                        with open(progress_file, 'w', encoding='utf-8') as f:
                            json.dump({
                                'processed_models': list(download_progress['processed_models']),
                                'refreshed_models': list(download_progress['refreshed_models']),
                                'completed': download_progress['completed'],
                                'total': download_progress['total'],
                                'last_update': time.time()
                            }, f, indent=2)
                
                except Exception as e:
                    error_msg = f"Error processing model {model.get('model_name')}: {str(e)}"
                    logger.error(error_msg, exc_info=True)
                    download_progress['errors'].append(error_msg)
                    download_progress['last_error'] = error_msg
                
                # Update progress
                download_progress['completed'] += 1
            
            # Mark as completed
            download_progress['status'] = 'completed'
            download_progress['end_time'] = time.time()
            logger.info(f"Example images download completed: {download_progress['completed']}/{download_progress['total']} models processed")
        
        except Exception as e:
            error_msg = f"Error during example images download: {str(e)}"
            logger.error(error_msg, exc_info=True)
            download_progress['errors'].append(error_msg)
            download_progress['last_error'] = error_msg
            download_progress['status'] = 'error'
            download_progress['end_time'] = time.time()
        
        finally:
            # Close the independent session
            try:
                await independent_session.close()
            except Exception as e:
                logger.error(f"Error closing download session: {e}")
                
            # Save final progress to file
            try:
                progress_file = os.path.join(output_dir, '.download_progress.json')
                with open(progress_file, 'w', encoding='utf-8') as f:
                    json.dump({
                        'processed_models': list(download_progress['processed_models']),
                        'refreshed_models': list(download_progress['refreshed_models']),
                        'completed': download_progress['completed'],
                        'total': download_progress['total'],
                        'last_update': time.time(),
                        'status': download_progress['status']
                    }, f, indent=2)
            except Exception as e:
                logger.error(f"Failed to save progress file: {e}")
            
            # Set download status to not downloading
            is_downloading = False
    
    @staticmethod
    async def update_lora_code(request):
        """
        Update Lora code in ComfyUI nodes
        
        Expects a JSON body with:
        {
            "node_ids": [123, 456], # List of node IDs to update
            "lora_code": "<lora:modelname:1.0>", # The Lora code to send
            "mode": "append" # or "replace" - whether to append or replace existing code
        }
        """
        try:
            # Parse the request body
            data = await request.json()
            node_ids = data.get('node_ids', [])
            lora_code = data.get('lora_code', '')
            mode = data.get('mode', 'append')
            
            if not node_ids or not lora_code:
                return web.json_response({
                    'success': False,
                    'error': 'Missing node_ids or lora_code parameter'
                }, status=400)
            
            # Send the lora code update to each node
            results = []
            for node_id in node_ids:
                try:
                    # Send the message to the frontend
                    PromptServer.instance.send_sync("lora_code_update", {
                        "id": node_id,
                        "lora_code": lora_code,
                        "mode": mode
                    })
                    results.append({
                        'node_id': node_id,
                        'success': True
                    })
                except Exception as e:
                    logger.error(f"Error sending lora code to node {node_id}: {e}")
                    results.append({
                        'node_id': node_id,
                        'success': False,
                        'error': str(e)
                    })
            
            return web.json_response({
                'success': True,
                'results': results
            })
            
        except Exception as e:
            logger.error(f"Failed to update lora code: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)
