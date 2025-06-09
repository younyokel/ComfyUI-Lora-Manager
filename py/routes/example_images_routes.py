import logging
import os
import asyncio
import json
import time
import aiohttp
import re
import subprocess
import sys
from aiohttp import web
from ..services.settings_manager import settings
from ..services.service_registry import ServiceRegistry
from ..utils.constants import SUPPORTED_MEDIA_EXTENSIONS
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

class ExampleImagesRoutes:
    """Routes for example images related functionality"""
    
    @staticmethod
    def setup_routes(app):
        """Register example images routes"""
        app.router.add_post('/api/download-example-images', ExampleImagesRoutes.download_example_images)
        app.router.add_post('/api/migrate-example-images', ExampleImagesRoutes.migrate_example_images)
        app.router.add_get('/api/example-images-status', ExampleImagesRoutes.get_example_images_status)
        app.router.add_post('/api/pause-example-images', ExampleImagesRoutes.pause_example_images)
        app.router.add_post('/api/resume-example-images', ExampleImagesRoutes.resume_example_images)
        app.router.add_post('/api/open-example-images-folder', ExampleImagesRoutes.open_example_images_folder)
        app.router.add_get('/api/example-image-files', ExampleImagesRoutes.get_example_image_files)

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
                ExampleImagesRoutes._download_all_example_images(
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
        
        for i, image in enumerate(model_images):
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
            
            # Use 0-based indexing instead of 1-based
            save_filename = f"image_{i}{image_ext}"
            
            # If optimizing images and this is a Civitai image, use their pre-optimized WebP version
            if is_image and optimize and 'civitai.com' in image_url:
                # Transform URL to use Civitai's optimized WebP version
                image_url = ExampleImagesRoutes._get_civitai_optimized_url(image_url)
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
    async def _update_model_metadata_from_local_examples(model, local_images_paths, scanner_type, scanner):
        """Update model metadata with local example images information
        
        Args:
            model: Model data dictionary
            local_images_paths: List of paths to local example images/videos
            scanner_type: Type of scanner ('lora' or 'checkpoint')
            scanner: Scanner instance for this model type
            
        Returns:
            bool: True if metadata was successfully updated, False otherwise
        """
        try:
            # Check if we need to update metadata (no civitai field or empty images)
            needs_update = not model.get('civitai') or not model.get('civitai', {}).get('images')
            
            if needs_update and local_images_paths:
                logger.debug(f"Found {len(local_images_paths)} local example images for {model.get('model_name')}, updating metadata")
                
                # Create or get civitai field
                if not model.get('civitai'):
                    model['civitai'] = {}
                
                # Create images array
                images = []
                
                # Generate metadata for each local image/video
                for path in local_images_paths:
                    # Determine if it's a video or image
                    file_ext = os.path.splitext(path)[1].lower()
                    is_video = file_ext in SUPPORTED_MEDIA_EXTENSIONS['videos']
                    
                    # Create image metadata entry
                    image_entry = {
                        "url": "",  # Empty URL as requested
                        "nsfwLevel": 0,
                        "width": 720,  # Default dimensions
                        "height": 1280,
                        "type": "video" if is_video else "image",
                        "meta": None,
                        "hasMeta": False,
                        "hasPositivePrompt": False
                    }
                    
                    # Try to get actual dimensions if it's an image (optional enhancement)
                    try:
                        from PIL import Image
                        if not is_video and os.path.exists(path):
                            with Image.open(path) as img:
                                image_entry["width"], image_entry["height"] = img.size
                    except:
                        # If PIL fails or isn't available, use default dimensions
                        pass
                        
                    images.append(image_entry)
                
                # Update the model's civitai.images field
                model['civitai']['images'] = images
                
                # Save metadata to the .metadata.json file
                file_path = model.get('file_path')
                base_path = os.path.splitext(file_path)[0]  # Remove .safetensors extension
                metadata_path = f"{base_path}.metadata.json"
                try:
                    # Create a copy of the model data without the 'folder' field
                    model_copy = model.copy()
                    model_copy.pop('folder', None)
                    
                    # Write the metadata to file without the folder field
                    with open(metadata_path, 'w', encoding='utf-8') as f:
                        json.dump(model_copy, f, indent=2, ensure_ascii=False)
                    logger.info(f"Saved metadata to {metadata_path}")
                except Exception as e:
                    logger.error(f"Failed to save metadata to {metadata_path}: {str(e)}")
                
                # Save updated metadata to scanner cache
                success = await scanner.update_single_model_cache(file_path, file_path, model)
                if success:
                    logger.info(f"Successfully updated metadata for {model.get('model_name')} with {len(images)} local examples")
                    return True
                else:
                    logger.warning(f"Failed to update metadata for {model.get('model_name')}")
            
            return False
        except Exception as e:
            logger.error(f"Error updating metadata from local examples: {str(e)}", exc_info=True)
            return False
    
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
                
                # Now check if we need to add this information to the model's metadata
                # This is handled externally by the caller with the new method
                
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
                        # Only process models with a valid sha256 (relaxed condition)
                        if model.get('sha256'):
                            all_models.append((scanner_type, model, scanner))
            
            # Update total count
            download_progress['total'] = len(all_models)
            logger.info(f"Found {download_progress['total']} models to process")
            
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
                    
                    # First check if we have local example images for this model
                    local_images_processed = False
                    local_image_paths = []
                    if model_file_path:
                        local_images_processed = await ExampleImagesRoutes._process_local_example_images(
                            model_file_path, 
                            model_file_name, 
                            model_name, 
                            model_dir, 
                            optimize
                        )
                        
                        # Collect local image paths for potential metadata update
                        if local_images_processed:
                            for file in os.listdir(model_dir):
                                file_path = os.path.join(model_dir, file)
                                if os.path.isfile(file_path):
                                    file_ext = os.path.splitext(file)[1].lower()
                                    is_supported = (file_ext in SUPPORTED_MEDIA_EXTENSIONS['images'] or
                                                   file_ext in SUPPORTED_MEDIA_EXTENSIONS['videos'])
                                    if is_supported:
                                        local_image_paths.append(file_path)
                            
                            # Update metadata if needed and if we found local images
                            await ExampleImagesRoutes._update_model_metadata_from_local_examples(
                                model,
                                local_image_paths,
                                scanner_type,
                                scanner
                            )
                            
                            # Mark as successfully processed if all local images were processed
                            download_progress['processed_models'].add(model_hash)
                            logger.info(f"Successfully processed local examples for {model_name}")
                    
                    # If we didn't process local images, download from remote only if metadata is available
                    if not local_images_processed and model.get('civitai') and model.get('civitai', {}).get('images'):
                        # Try to download images
                        images = model.get('civitai', {}).get('images', [])
                        
                        model_success, is_stale_metadata = await ExampleImagesRoutes._process_model_images(
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
                            refresh_success = await ExampleImagesRoutes._refresh_model_metadata(
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
                                    model_success, _ = await ExampleImagesRoutes._process_model_images(
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
                ExampleImagesRoutes._migrate_all_example_images(
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
            regex_pattern = ExampleImagesRoutes._convert_pattern_to_regex(pattern)
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
                        example_files = ExampleImagesRoutes._find_matching_example_files(
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
                            
                            # Track local image paths for metadata update
                            local_image_paths = []
                            
                            # Migrate each example file
                            for local_image_path, index in example_files:
                                # Get file extension
                                local_ext = os.path.splitext(local_image_path)[1].lower()
                                save_filename = f"image_{index}{local_ext}"
                                save_path = os.path.join(model_dir, save_filename)
                                
                                # Track all local image paths for potential metadata update
                                local_image_paths.append(local_image_path)
                                
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
                            
                            # Update model metadata if local images were found
                            if local_image_paths:
                                await ExampleImagesRoutes._update_model_metadata_from_local_examples(
                                    model,
                                    local_image_paths,
                                    scanner_type,
                                    scanner
                                )
                            
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
        if (model_count > 1):
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
    async def get_example_image_files(request):
        """
        Get list of example image files for a specific model
        
        Expects:
        - model_hash in query parameters
        
        Returns:
        - List of image files with their paths
        """
        try:
            # Get the model hash from query parameters
            model_hash = request.query.get('model_hash')
            
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
                    'error': 'No example images path configured'
                }, status=400)
            
            # Construct the folder path for this model
            model_folder = os.path.join(example_images_path, model_hash)
            
            # Check if the folder exists
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
                    # Check if the file is a supported media file
                    file_ext = os.path.splitext(file)[1].lower()
                    if (file_ext in SUPPORTED_MEDIA_EXTENSIONS['images'] or 
                        file_ext in SUPPORTED_MEDIA_EXTENSIONS['videos']):
                        files.append({
                            'name': file,
                            'path': f'/example_images_static/{model_hash}/{file}',
                            'extension': file_ext,
                            'is_video': file_ext in SUPPORTED_MEDIA_EXTENSIONS['videos']
                        })
            
            # Check if files are using 1-based indexing (looking for pattern like "image_1.jpg")
            has_one_based = any(re.match(r'image_1\.\w+$', f['name']) for f in files)
            has_zero_based = any(re.match(r'image_0\.\w+$', f['name']) for f in files)
            
            # If there's 1-based indexing and no 0-based, rename files
            if has_one_based and not has_zero_based:
                logger.info(f"Converting 1-based to 0-based indexing in {model_folder}")
                # Sort files to ensure we process them in the right order
                files.sort(key=lambda x: x['name'])
                
                # First, create a mapping of renames to avoid conflicts
                renames = []
                for file in files:
                    match = re.match(r'image_(\d+)\.(\w+)$', file['name'])
                    if match:
                        index = int(match.group(1))
                        ext = match.group(2)
                        if index > 0:  # Only rename if index is positive
                            new_name = f"image_{index-1}.{ext}"
                            renames.append((file['name'], new_name))
                
                # To avoid conflicts, use temporary filenames first
                for old_name, new_name in renames:
                    old_path = os.path.join(model_folder, old_name)
                    temp_path = os.path.join(model_folder, f"temp_{old_name}")
                    try:
                        os.rename(old_path, temp_path)
                    except Exception as e:
                        logger.error(f"Failed to rename {old_path} to {temp_path}: {e}")
                
                # Now rename from temporary names to final names
                for old_name, new_name in renames:
                    temp_path = os.path.join(model_folder, f"temp_{old_name}")
                    new_path = os.path.join(model_folder, new_name)
                    try:
                        os.rename(temp_path, new_path)
                        logger.debug(f"Renamed {old_name} to {new_name}")
                        
                        # Update the entry in our files list
                        for file in files:
                            if file['name'] == old_name:
                                file['name'] = new_name
                                file['path'] = f'/example_images_static/{model_hash}/{new_name}'
                    except Exception as e:
                        logger.error(f"Failed to rename {temp_path} to {new_path}: {e}")
                
                # Refresh the file list after renaming
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
            
            # Sort files by their index for consistent ordering
            def extract_index(filename):
                match = re.match(r'image_(\d+)\.\w+$', filename)
                if match:
                    return int(match.group(1))
                return float('inf')  # Put non-matching files at the end
            
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
