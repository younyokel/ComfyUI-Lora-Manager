import logging
import os
import asyncio
import json
import time
import aiohttp
import re
import subprocess
import sys
from server import PromptServer # type: ignore
from aiohttp import web
from ..services.settings_manager import settings
from ..utils.usage_stats import UsageStats
from ..services.service_registry import ServiceRegistry
from ..utils.constants import SUPPORTED_MEDIA_EXTENSIONS
from ..services.civitai_client import CivitaiClient
from ..utils.routes_common import ModelRouteUtils
from ..utils.lora_metadata import extract_trained_words

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
        app.router.add_post('/api/migrate-example-images', MiscRoutes.migrate_example_images)
        app.router.add_get('/api/example-images-status', MiscRoutes.get_example_images_status)
        app.router.add_post('/api/pause-example-images', MiscRoutes.pause_example_images)
        app.router.add_post('/api/resume-example-images', MiscRoutes.resume_example_images)
        
        # Lora code update endpoint
        app.router.add_post('/api/update-lora-code', MiscRoutes.update_lora_code)
        
        # Add new route for opening example images folder
        app.router.add_post('/api/open-example-images-folder', MiscRoutes.open_example_images_folder)

        # Add new route for getting trained words
        app.router.add_get('/api/trained-words', MiscRoutes.get_trained_words)

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
            
            # Add version information to help clients handle format changes
            stats_response = {
                'success': True,
                'data': stats,
                'format_version': 2  # Indicate this is the new format with history
            }
            
            return web.json_response(stats_response)
            
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
    def _get_civitai_optimized_url(image_url):
        """Convert a Civitai image URL to its optimized WebP version
        
        Args:
            image_url: Original Civitai image URL
            
        Returns:
            str: URL to optimized WebP version
        """
        # Match the base part of Civitai URLs
        base_pattern = r'(https://image\.civitai\.com/[^/]+/[^/]+)'
        match = re.match(base_pattern, image_url)
        
        if match:
            base_url = match.group(1)
            # Create the optimized WebP URL
            return f"{base_url}/optimized=true/image.webp"
        
        # Return original URL if it doesn't match the expected format
        return image_url
    
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
            
            # If optimizing images and this is a Civitai image, use their pre-optimized WebP version
            if is_image and optimize and 'civitai.com' in image_url:
                # Transform URL to use Civitai's optimized WebP version
                image_url = MiscRoutes._get_civitai_optimized_url(image_url)
                # Update filename to use .webp extension
                save_filename = f"image_{i}.webp"
            
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
                
                for local_image_path in local_images:
                    # Extract the index from the filename
                    file_name = os.path.basename(local_image_path)
                    example_prefix = f"{model_file_name}.example."
                    
                    try:
                        # Extract the part after '.example.' and before file extension
                        index_part = file_name[len(example_prefix):].split('.')[0]
                        # Try to parse it as an integer
                        index = int(index_part)
                        local_ext = os.path.splitext(local_image_path)[1].lower()
                        save_filename = f"image_{index}{local_ext}"
                    except (ValueError, IndexError):
                        # If we can't parse the index, fall back to a sequential number
                        logger.warning(f"Could not extract index from {file_name}, using sequential numbering")
                        local_ext = os.path.splitext(local_image_path)[1].lower()
                        save_filename = f"image_{len(local_images)}{local_ext}"
                    
                    save_path = os.path.join(model_dir, save_filename)
                    
                    # Skip if already exists in output directory
                    if os.path.exists(save_path):
                        logger.debug(f"File already exists in output: {save_path}")
                        continue
                    
                    # Copy the file
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
    async def migrate_example_images(request):
        """
        Migrate existing example images to central storage location
        
        Expects a JSON body with:
        {
            "output_dir": "path/to/output",  # Base directory to save example images
            "pattern": "{model}.example.{index}.{ext}",  # Pattern to match example images
            "optimize": true,                # Whether to optimize images (default: true)
            "model_types": ["lora", "checkpoint"], # Model types to process (default: both)
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
                'error': 'Download or migration already in progress',
                'status': response_progress
            }, status=400)
        
        try:
            # Parse the request body
            data = await request.json()
            output_dir = data.get('output_dir')
            pattern = data.get('pattern', '{model}.example.{index}.{ext}')
            optimize = data.get('optimize', True)
            model_types = data.get('model_types', ['lora', 'checkpoint'])
            
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
            download_progress['is_migrating'] = True  # Mark this as a migration task
            
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
            
            # Start the migration task
            is_downloading = True
            download_task = asyncio.create_task(
                MiscRoutes._migrate_all_example_images(
                    output_dir, 
                    pattern,
                    optimize, 
                    model_types
                )
            )
            
            # Create a copy for JSON serialization
            response_progress = download_progress.copy()
            response_progress['processed_models'] = list(download_progress['processed_models'])
            response_progress['refreshed_models'] = list(download_progress['refreshed_models'])
            response_progress['is_migrating'] = True
            
            return web.json_response({
                'success': True,
                'message': 'Migration started',
                'status': response_progress
            })
            
        except Exception as e:
            logger.error(f"Failed to start example images migration: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)
    
    @staticmethod
    async def _migrate_all_example_images(output_dir, pattern, optimize, model_types):
        """Migrate example images for all models based on pattern
        
        Args:
            output_dir: Base directory to save example images
            pattern: Pattern to match example images
            optimize: Whether to optimize images
            model_types: List of model types to process
        """
        global is_downloading, download_progress
        
        try:
            # Get the scanners
            scanners = []
            if 'lora' in model_types:
                lora_scanner = await ServiceRegistry.get_lora_scanner()
                scanners.append(('lora', lora_scanner))
            
            if 'checkpoint' in model_types:
                checkpoint_scanner = await ServiceRegistry.get_checkpoint_scanner()
                scanners.append(('checkpoint', checkpoint_scanner))
            
            # Convert user pattern to regex
            regex_pattern = MiscRoutes._convert_pattern_to_regex(pattern)
            logger.info(f"Using pattern regex: {regex_pattern.pattern}")
            
            # Get all models from all scanners
            all_models = []
            for scanner_type, scanner in scanners:
                cache = await scanner.get_cached_data()
                if cache and cache.raw_data:
                    for model in cache.raw_data:
                        # Only process models with a valid file path and sha256
                        if model.get('file_path') and model.get('sha256'):
                            all_models.append((scanner_type, model, scanner))
            
            # Update total count
            download_progress['total'] = len(all_models)
            logger.info(f"Found {download_progress['total']} models to check for example images")
            
            # Process each model
            for scanner_type, model, scanner in all_models:
                # Check if download is paused
                while download_progress['status'] == 'paused':
                    await asyncio.sleep(1)
                
                # Check if download should continue
                if download_progress['status'] != 'running':
                    logger.info(f"Migration stopped: {download_progress['status']}")
                    break
                
                model_hash = model.get('sha256', '').lower()
                model_name = model.get('model_name', 'Unknown')
                model_file_path = model.get('file_path', '')
                model_file_name = os.path.basename(model_file_path) if model_file_path else ''
                model_dir_path = os.path.dirname(model_file_path) if model_file_path else ''
                
                try:
                    # Update current model info
                    download_progress['current_model'] = f"{model_name} ({model_hash[:8]})"
                    
                    # Skip if already processed
                    if model_hash in download_progress['processed_models']:
                        logger.debug(f"Skipping already processed model: {model_name}")
                        download_progress['completed'] += 1
                        continue
                    
                    # Find matching example files based on pattern
                    if model_file_name and os.path.exists(model_dir_path):
                        example_files = MiscRoutes._find_matching_example_files(
                            model_dir_path, 
                            model_file_name, 
                            regex_pattern
                        )
                        
                        # Process found files
                        if example_files:
                            logger.info(f"Found {len(example_files)} example images for {model_name}")

                            # Create model directory in output location
                            model_dir = os.path.join(output_dir, model_hash)
                            os.makedirs(model_dir, exist_ok=True)
                            
                            # Migrate each example file
                            for local_image_path, index in example_files:
                                # Get file extension
                                local_ext = os.path.splitext(local_image_path)[1].lower()
                                save_filename = f"image_{index}{local_ext}"
                                save_path = os.path.join(model_dir, save_filename)
                                
                                # Skip if already exists in output directory
                                if os.path.exists(save_path):
                                    logger.debug(f"File already exists in output: {save_path}")
                                    continue
                                
                                try:
                                    # Copy the file
                                    with open(local_image_path, 'rb') as src_file:
                                        with open(save_path, 'wb') as dst_file:
                                            dst_file.write(src_file.read())
                                    logger.debug(f"Migrated {os.path.basename(local_image_path)} to {save_path}")
                                except Exception as e:
                                    error_msg = f"Failed to copy file {os.path.basename(local_image_path)}: {str(e)}"
                                    logger.error(error_msg)
                                    download_progress['errors'].append(error_msg)
                                    download_progress['last_error'] = error_msg
                            
                            # Mark this model as processed
                            download_progress['processed_models'].add(model_hash)
                    
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
            download_progress['is_migrating'] = False
            logger.info(f"Example images migration completed: {download_progress['completed']}/{download_progress['total']} models processed")
        
        except Exception as e:
            error_msg = f"Error during example images migration: {str(e)}"
            logger.error(error_msg, exc_info=True)
            download_progress['errors'].append(error_msg)
            download_progress['last_error'] = error_msg
            download_progress['status'] = 'error'
            download_progress['end_time'] = time.time()
            download_progress['is_migrating'] = False
        
        finally:
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
                        'status': download_progress['status'],
                        'is_migrating': False
                    }, f, indent=2)
            except Exception as e:
                logger.error(f"Failed to save progress file: {e}")
            
            # Set download status to not downloading
            is_downloading = False
    
    @staticmethod
    def _convert_pattern_to_regex(pattern):
        """Convert a user-friendly template pattern to a regex pattern
        
        Args:
            pattern: Template pattern string
            
        Returns:
            re.Pattern: Compiled regex pattern object
        """
        # Normalize path separators to forward slashes for consistent matching
        pattern = pattern.replace('\\', '/')
        
        # Escape special regex characters
        regex_safe = re.escape(pattern)
        
        # Handle multiple occurrences of {model}
        model_count = pattern.count('{model}')
        if model_count > 1:
            # Replace the first occurrence with a named capture group
            regex_safe = regex_safe.replace(r'\{model\}', r'(?P<model>.*?)', 1)
            
            # Replace subsequent occurrences with a back-reference
            # Using (?P=model) for Python's regex named backreference syntax
            for _ in range(model_count - 1):
                regex_safe = regex_safe.replace(r'\{model\}', r'(?P=model)', 1)
        else:
            # Just one occurrence, handle normally
            regex_safe = regex_safe.replace(r'\{model\}', r'(?P<model>.*?)')
        
        # {index} becomes a capture group for digits
        regex_safe = regex_safe.replace(r'\{index\}', r'(?P<index>\d+)')
        
        # {ext} becomes a capture group for file extension WITHOUT including the dot
        regex_safe = regex_safe.replace(r'\{ext\}', r'(?P<ext>\w+)')
        
        # Handle wildcard * character (which was escaped earlier)
        regex_safe = regex_safe.replace(r'\*', r'.*?')
        
        logger.info(f"Converted pattern '{pattern}' to regex: '{regex_safe}'")
        
        # Compile the regex pattern
        return re.compile(regex_safe)
    
    @staticmethod
    def _find_matching_example_files(dir_path, model_filename, regex_pattern):
        """Find example files matching the pattern in the given directory
        
        Args:
            dir_path: Directory to search in
            model_filename: Model filename (without extension)
            regex_pattern: Compiled regex pattern to match against
            
        Returns:
            list: List of tuples (file_path, index) of matching files
        """
        matching_files = []
        model_name = os.path.splitext(model_filename)[0]
        
        # Check if pattern contains a directory separator
        has_subdirs = '/' in regex_pattern.pattern or '\\\\' in regex_pattern.pattern
        
        # Determine search paths (keep existing logic for subdirectories)
        if has_subdirs:
            # Handle patterns with subdirectories
            subdir_match = re.match(r'.*(?P<model>.*?)(/|\\\\).*', regex_pattern.pattern)
            if subdir_match:
                potential_subdir = os.path.join(dir_path, model_name)
                if os.path.exists(potential_subdir) and os.path.isdir(potential_subdir):
                    search_paths = [potential_subdir]
                else:
                    search_paths = [dir_path]
            else:
                search_paths = [dir_path]
        else:
            search_paths = [dir_path]
        
        for search_path in search_paths:
            if not os.path.exists(search_path):
                continue
                
            # For optimized performance: create a model name prefix check
            # This works for any pattern where the model name appears at the start
            if not has_subdirs:
                # Get list of all files first
                all_files = os.listdir(search_path)
                
                # First pass: filter files that start with model name (case insensitive)
                # This is much faster than regex for initial filtering
                potential_matches = []
                lower_model_name = model_name.lower()
                
                for file in all_files:
                    # Quick check if file starts with model name
                    if file.lower().startswith(lower_model_name):
                        file_path = os.path.join(search_path, file)
                        if os.path.isfile(file_path):
                            potential_matches.append((file, file_path))
                
                # Second pass: apply full regex only to potential matches
                for file, file_path in potential_matches:
                    match = regex_pattern.match(file)
                    if match:
                        # Verify model name matches exactly what we're looking for
                        if match.group('model') != model_name:
                            logger.debug(f"File {file} matched pattern but model name {match.group('model')} doesn't match {model_name}")
                            continue
                            
                        # Check if file extension is supported
                        file_ext = os.path.splitext(file)[1].lower()
                        is_supported = (file_ext in SUPPORTED_MEDIA_EXTENSIONS['images'] or 
                                        file_ext in SUPPORTED_MEDIA_EXTENSIONS['videos'])
                        
                        if is_supported:
                            # Extract index from match
                            try:
                                index = int(match.group('index'))
                            except (IndexError, ValueError):
                                index = len(matching_files) + 1
                                
                            matching_files.append((file_path, index))
            else:
                # Original scanning logic for patterns with subdirectories
                for file in os.listdir(search_path):
                    file_path = os.path.join(search_path, file)
                    if os.path.isfile(file_path):
                        # Try to match the filename directly first
                        match = regex_pattern.match(file)
                        
                        # If no match and subdirs are expected, try the relative path
                        if not match and has_subdirs:
                            # Get relative path and normalize slashes for consistent matching
                            rel_path = os.path.relpath(file_path, dir_path)
                            # Replace Windows backslashes with forward slashes for consistent regex matching
                            rel_path = rel_path.replace('\\', '/')
                            match = regex_pattern.match(rel_path)
                        
                        if match:
                            # For subdirectory patterns, model name in the match might refer to the dir name only
                            # so we need a different checking logic
                            matched_model = match.group('model')
                            if has_subdirs and '/' in rel_path:
                                # For subdirectory patterns, it's okay if just the folder name matches
                                folder_name = rel_path.split('/')[0]
                                if matched_model != model_name and matched_model != folder_name:
                                    logger.debug(f"File {file} matched pattern but model name {matched_model} doesn't match {model_name}")
                                    continue
                            elif matched_model != model_name:
                                logger.debug(f"File {file} matched pattern but model name {matched_model} doesn't match {model_name}")
                                continue
                                
                            file_ext = os.path.splitext(file)[1].lower()
                            is_supported = (file_ext in SUPPORTED_MEDIA_EXTENSIONS['images'] or 
                                        file_ext in SUPPORTED_MEDIA_EXTENSIONS['videos'])
                            
                            if is_supported:
                                try:
                                    index = int(match.group('index'))
                                except (IndexError, ValueError):
                                    index = len(matching_files) + 1
                                
                                matching_files.append((file_path, index))
        
        # Sort files by their index
        matching_files.sort(key=lambda x: x[1])
        return matching_files
    
    @staticmethod
    async def update_lora_code(request):
        """
        Update Lora code in ComfyUI nodes
        
        Expects a JSON body with:
        {
            "node_ids": [123, 456], # Optional - List of node IDs to update (for browser mode)
            "lora_code": "<lora:modelname:1.0>", # The Lora code to send
            "mode": "append" # or "replace" - whether to append or replace existing code
        }
        """
        try:
            # Parse the request body
            data = await request.json()
            node_ids = data.get('node_ids')
            lora_code = data.get('lora_code', '')
            mode = data.get('mode', 'append')
            
            if not lora_code:
                return web.json_response({
                    'success': False,
                    'error': 'Missing lora_code parameter'
                }, status=400)
            
            results = []
            
            # Desktop mode: no specific node_ids provided
            if node_ids is None:
                try:
                    # Send broadcast message with id=-1 to all Lora Loader nodes
                    PromptServer.instance.send_sync("lora_code_update", {
                        "id": -1,
                        "lora_code": lora_code,
                        "mode": mode
                    })
                    results.append({
                        'node_id': 'broadcast',
                        'success': True
                    })
                except Exception as e:
                    logger.error(f"Error broadcasting lora code: {e}")
                    results.append({
                        'node_id': 'broadcast',
                        'success': False,
                        'error': str(e)
                    })
            else:
                # Browser mode: send to specific nodes
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

    @staticmethod
    async def open_example_images_folder(request):
        """
        Open the example images folder for a specific model
        
        Expects a JSON body with:
        {
            "model_hash": "sha256_hash"  # SHA256 hash of the model
        }
        """
        try:
            # Parse the request body
            data = await request.json()
            model_hash = data.get('model_hash')
            
            if not model_hash:
                return web.json_response({
                    'success': False,
                    'error': 'Missing model_hash parameter'
                }, status=400)
            
            # Get the example images path from settings
            example_images_path = settings.get('example_images_path')
            if not example_images_path:
                return web.json_response({
                    'success': False,
                    'error': 'No example images path configured. Please set it in the settings panel first.'
                }, status=400)
            
            # Construct the folder path for this model
            model_folder = os.path.join(example_images_path, model_hash)
            
            # Check if the folder exists
            if not os.path.exists(model_folder):
                return web.json_response({
                    'success': False,
                    'error': 'No example images found for this model. Download example images first.'
                }, status=404)
            
            # Open the folder in the file explorer
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
    async def get_trained_words(request):
        """
        Get trained words from a safetensors file, sorted by frequency
        
        Expects a query parameter:
        file_path: Path to the safetensors file
        """
        try:
            # Get file path from query parameters
            file_path = request.query.get('file_path')
            
            if not file_path:
                return web.json_response({
                    'success': False,
                    'error': 'Missing file_path parameter'
                }, status=400)
            
            # Check if file exists and is a safetensors file
            if not os.path.exists(file_path):
                return web.json_response({
                    'success': False,
                    'error': f"File not found: {file_path}"
                }, status=404)
                
            if not file_path.lower().endswith('.safetensors'):
                return web.json_response({
                    'success': False,
                    'error': 'File is not a safetensors file'
                }, status=400)
            
            # Extract trained words and class_tokens
            trained_words, class_tokens = await extract_trained_words(file_path)
            
            # Return result with both trained words and class tokens
            return web.json_response({
                'success': True,
                'trained_words': trained_words,
                'class_tokens': class_tokens
            })
            
        except Exception as e:
            logger.error(f"Failed to get trained words: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=500)
