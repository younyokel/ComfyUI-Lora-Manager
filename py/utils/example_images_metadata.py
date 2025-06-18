import logging
import os
from ..utils.metadata_manager import MetadataManager
from ..utils.routes_common import ModelRouteUtils
from ..utils.constants import SUPPORTED_MEDIA_EXTENSIONS

logger = logging.getLogger(__name__)

class MetadataUpdater:
    """Handles updating model metadata related to example images"""
    
    @staticmethod
    async def refresh_model_metadata(model_hash, model_name, scanner_type, scanner):
        """Refresh model metadata from CivitAI
        
        Args:
            model_hash: SHA256 hash of the model
            model_name: Model name (for logging)
            scanner_type: Scanner type ('lora' or 'checkpoint')
            scanner: Scanner instance for this model type
            
        Returns:
            bool: True if metadata was successfully refreshed, False otherwise
        """
        from ..utils.example_images_download_manager import download_progress
        
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
            
            # Use ModelRouteUtils to refresh metadata
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
    async def get_updated_model(model_hash, scanner):
        """Get updated model data
        
        Args:
            model_hash: SHA256 hash of the model
            scanner: Scanner instance
            
        Returns:
            dict: Updated model data or None if not found
        """
        cache = await scanner.get_cached_data()
        for item in cache.raw_data:
            if item.get('sha256') == model_hash:
                return item
        return None
    
    @staticmethod
    async def update_metadata_from_local_examples(model_hash, model, scanner_type, scanner, model_dir):
        """Update model metadata with local example image information
        
        Args:
            model_hash: SHA256 hash of the model
            model: Model data dictionary
            scanner_type: Scanner type ('lora' or 'checkpoint')
            scanner: Scanner instance for this model type
            model_dir: Model images directory
            
        Returns:
            bool: True if metadata was successfully updated, False otherwise
        """
        try:
            # Collect local image paths
            local_images_paths = []
            if os.path.exists(model_dir):
                for file in os.listdir(model_dir):
                    file_path = os.path.join(model_dir, file)
                    if os.path.isfile(file_path):
                        file_ext = os.path.splitext(file)[1].lower()
                        is_supported = (file_ext in SUPPORTED_MEDIA_EXTENSIONS['images'] or
                                       file_ext in SUPPORTED_MEDIA_EXTENSIONS['videos'])
                        if is_supported:
                            local_images_paths.append(file_path)
            
            # Check if metadata update is needed (no civitai field or empty images)
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
                    # Determine if video or image
                    file_ext = os.path.splitext(path)[1].lower()
                    is_video = file_ext in SUPPORTED_MEDIA_EXTENSIONS['videos']
                    
                    # Create image metadata entry
                    image_entry = {
                        "url": "",  # Empty URL as required
                        "nsfwLevel": 0,
                        "width": 720,  # Default dimensions
                        "height": 1280,
                        "type": "video" if is_video else "image",
                        "meta": None,
                        "hasMeta": False,
                        "hasPositivePrompt": False
                    }
                    
                    # If it's an image, try to get actual dimensions (optional enhancement)
                    try:
                        from PIL import Image
                        if not is_video and os.path.exists(path):
                            with Image.open(path) as img:
                                image_entry["width"], image_entry["height"] = img.size
                    except:
                        # If PIL fails or is unavailable, use default dimensions
                        pass
                        
                    images.append(image_entry)
                
                # Update the model's civitai.images field
                model['civitai']['images'] = images
                
                # Save metadata to .metadata.json file
                file_path = model.get('file_path')
                try:
                    # Create a copy of model data without 'folder' field
                    model_copy = model.copy()
                    model_copy.pop('folder', None)
                    
                    # Write metadata to file
                    await MetadataManager.save_metadata(file_path, model_copy)
                    logger.info(f"Saved metadata for {model.get('model_name')}")
                except Exception as e:
                    logger.error(f"Failed to save metadata for {model.get('model_name')}: {str(e)}")
                
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
    async def update_metadata_after_import(model_hash, model_data, scanner, newly_imported_paths):
        """Update model metadata after importing example images
        
        Args:
            model_hash: SHA256 hash of the model
            model_data: Model data dictionary
            scanner: Scanner instance (lora or checkpoint)
            newly_imported_paths: List of paths to newly imported files
            
        Returns:
            list: Updated images array
        """
        try:
            # Ensure civitai field exists in model_data
            if not model_data.get('civitai'):
                model_data['civitai'] = {}
            
            # Ensure images array exists
            if not model_data['civitai'].get('images'):
                model_data['civitai']['images'] = []
            
            # Get current images array
            images = model_data['civitai']['images']
            
            # Add new image entry for each imported file
            for path in newly_imported_paths:
                # Determine if video or image
                file_ext = os.path.splitext(path)[1].lower()
                is_video = file_ext in SUPPORTED_MEDIA_EXTENSIONS['videos']
                
                # Create image metadata entry
                image_entry = {
                    "url": "",  # Empty URL as required
                    "nsfwLevel": 0,
                    "width": 720,  # Default dimensions
                    "height": 1280,
                    "type": "video" if is_video else "image",
                    "meta": None,
                    "hasMeta": False,
                    "hasPositivePrompt": False
                }
                
                # If it's an image, try to get actual dimensions
                try:
                    from PIL import Image
                    if not is_video and os.path.exists(path):
                        with Image.open(path) as img:
                            image_entry["width"], image_entry["height"] = img.size
                except:
                    # If PIL fails or is unavailable, use default dimensions
                    pass
                    
                # Append to existing images array
                images.append(image_entry)
            
            # Save metadata to .metadata.json file
            file_path = model_data.get('file_path')
            if file_path:
                try:
                    # Create a copy of model data without 'folder' field
                    model_copy = model_data.copy()
                    model_copy.pop('folder', None)
                    
                    # Write metadata to file
                    await MetadataManager.save_metadata(file_path, model_copy)
                    logger.info(f"Saved metadata for {model_data.get('model_name')}")
                except Exception as e:
                    logger.error(f"Failed to save metadata: {str(e)}")
            
            # Save updated metadata to scanner cache
            if file_path:
                await scanner.update_single_model_cache(file_path, file_path, model_data)
            
            return images
                
        except Exception as e:
            logger.error(f"Failed to update metadata after import: {e}", exc_info=True)
            return []