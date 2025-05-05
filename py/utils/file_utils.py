import logging
import os
import hashlib
import json
import time
from typing import Dict, Optional, Type

from .model_utils import determine_base_model
from .lora_metadata import extract_lora_metadata, extract_checkpoint_metadata
from .models import BaseModelMetadata, LoraMetadata, CheckpointMetadata
from .constants import PREVIEW_EXTENSIONS, CARD_PREVIEW_WIDTH
from .exif_utils import ExifUtils

logger = logging.getLogger(__name__)

async def calculate_sha256(file_path: str) -> str:
    """Calculate SHA256 hash of a file"""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(128 * 1024), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def find_preview_file(base_name: str, dir_path: str) -> str:
    """Find preview file for given base name in directory"""
    
    for ext in PREVIEW_EXTENSIONS:
        full_pattern = os.path.join(dir_path, f"{base_name}{ext}")
        if os.path.exists(full_pattern):
            # Check if this is an image and not already webp
            if ext.lower().endswith(('.jpg', '.jpeg', '.png')) and not ext.lower().endswith('.webp'):
                try:
                    # Optimize the image to webp format
                    webp_path = os.path.join(dir_path, f"{base_name}.webp")
                    
                    # Use ExifUtils to optimize the image
                    with open(full_pattern, 'rb') as f:
                        image_data = f.read()
                    
                    optimized_data, _ = ExifUtils.optimize_image(
                        image_data=image_data,
                        target_width=CARD_PREVIEW_WIDTH,
                        format='webp',
                        quality=85,
                        preserve_metadata=False  # Changed from True to False
                    )
                    
                    # Save the optimized webp file
                    with open(webp_path, 'wb') as f:
                        f.write(optimized_data)
                    
                    logger.debug(f"Optimized preview image from {full_pattern} to {webp_path}")
                    return webp_path.replace(os.sep, "/")
                except Exception as e:
                    logger.error(f"Error optimizing preview image {full_pattern}: {e}")
                    # Fall back to original file if optimization fails
                    return full_pattern.replace(os.sep, "/")
            
            # Return the original path for webp images or non-image files
            return full_pattern.replace(os.sep, "/")
    
    return ""

def normalize_path(path: str) -> str:
    """Normalize file path to use forward slashes"""
    return path.replace(os.sep, "/") if path else path

async def get_file_info(file_path: str, model_class: Type[BaseModelMetadata] = LoraMetadata) -> Optional[BaseModelMetadata]:
    """Get basic file information as a model metadata object"""
    # First check if file actually exists and resolve symlinks
    try:
        real_path = os.path.realpath(file_path)
        if not os.path.exists(real_path):
            return None
    except Exception as e:
        logger.error(f"Error checking file existence for {file_path}: {e}")
        return None
        
    base_name = os.path.splitext(os.path.basename(file_path))[0]
    dir_path = os.path.dirname(file_path)
    
    preview_url = find_preview_file(base_name, dir_path)
    
    # Check if a .json file exists with SHA256 hash to avoid recalculation
    json_path = f"{os.path.splitext(file_path)[0]}.json"
    sha256 = None
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                json_data = json.load(f)
                if 'sha256' in json_data:
                    sha256 = json_data['sha256'].lower()
                    logger.debug(f"Using SHA256 from .json file for {file_path}")
        except Exception as e:
            logger.error(f"Error reading .json file for {file_path}: {e}")
    
    # If SHA256 is still not found, check for a .sha256 file
    if sha256 is None:
        sha256_file = f"{os.path.splitext(file_path)[0]}.sha256"
        if os.path.exists(sha256_file):
            try:
                with open(sha256_file, 'r', encoding='utf-8') as f:
                    sha256 = f.read().strip().lower()
                    logger.debug(f"Using SHA256 from .sha256 file for {file_path}")
            except Exception as e:
                logger.error(f"Error reading .sha256 file for {file_path}: {e}")

    try:
        # If we didn't get SHA256 from the .json file, calculate it
        if not sha256:
            start_time = time.time()
            sha256 = await calculate_sha256(real_path)
            logger.debug(f"Calculated SHA256 for {file_path} in {time.time() - start_time:.2f} seconds")
        
        # Create default metadata based on model class
        if model_class == CheckpointMetadata:
            metadata = CheckpointMetadata(
                file_name=base_name,
                model_name=base_name,
                file_path=normalize_path(file_path),
                size=os.path.getsize(real_path),
                modified=os.path.getmtime(real_path),
                sha256=sha256,
                base_model="Unknown",  # Will be updated later
                preview_url=normalize_path(preview_url),
                tags=[],
                modelDescription="",
                model_type="checkpoint"
            )
            
            # Extract checkpoint-specific metadata
            # model_info = await extract_checkpoint_metadata(real_path)
            # metadata.base_model = model_info['base_model']
            # if 'model_type' in model_info:
            #     metadata.model_type = model_info['model_type']
            
        else:  # Default to LoraMetadata
            metadata = LoraMetadata(
                file_name=base_name,
                model_name=base_name,
                file_path=normalize_path(file_path),
                size=os.path.getsize(real_path),
                modified=os.path.getmtime(real_path),
                sha256=sha256,
                base_model="Unknown",  # Will be updated later
                usage_tips="{}",
                preview_url=normalize_path(preview_url),
                tags=[],
                modelDescription=""
            )
            
            # Extract lora-specific metadata
            model_info = await extract_lora_metadata(real_path)
            metadata.base_model = model_info['base_model']

        # Save metadata to file
        await save_metadata(file_path, metadata)
        
        return metadata
    except Exception as e:
        logger.error(f"Error getting file info for {file_path}: {e}")
        return None

async def save_metadata(file_path: str, metadata: BaseModelMetadata) -> None:
    """Save metadata to .metadata.json file"""
    metadata_path = f"{os.path.splitext(file_path)[0]}.metadata.json"
    try:
        metadata_dict = metadata.to_dict()
        metadata_dict['file_path'] = normalize_path(metadata_dict['file_path'])
        metadata_dict['preview_url'] = normalize_path(metadata_dict['preview_url'])
        
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata_dict, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving metadata to {metadata_path}: {str(e)}")

async def load_metadata(file_path: str, model_class: Type[BaseModelMetadata] = LoraMetadata) -> Optional[BaseModelMetadata]:
    """Load metadata from .metadata.json file"""
    metadata_path = f"{os.path.splitext(file_path)[0]}.metadata.json"
    try:
        if os.path.exists(metadata_path):
            with open(metadata_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
                needs_update = False

                # Check and normalize base model name
                normalized_base_model = determine_base_model(data['base_model'])
                if data['base_model'] != normalized_base_model:
                    data['base_model'] = normalized_base_model
                    needs_update = True
                
                # Compare paths without extensions
                stored_path_base = os.path.splitext(data['file_path'])[0]
                current_path_base = os.path.splitext(normalize_path(file_path))[0]
                if stored_path_base != current_path_base:
                    data['file_path'] = normalize_path(file_path)
                    needs_update = True
                
                # TODO: optimize preview image to webp format if not already done
                preview_url = data.get('preview_url', '')
                if not preview_url or not os.path.exists(preview_url):
                    base_name = os.path.splitext(os.path.basename(file_path))[0]
                    dir_path = os.path.dirname(file_path)
                    new_preview_url = normalize_path(find_preview_file(base_name, dir_path))
                    if new_preview_url != preview_url:
                        data['preview_url'] = new_preview_url
                        needs_update = True
                else:
                    # Compare preview paths without extensions
                    stored_preview_base = os.path.splitext(preview_url)[0]
                    current_preview_base = os.path.splitext(normalize_path(preview_url))[0]
                    if stored_preview_base != current_preview_base:
                        data['preview_url'] = normalize_path(preview_url)
                        needs_update = True

                # Ensure all fields are present
                if 'tags' not in data:
                    data['tags'] = []
                    needs_update = True
                    
                if 'modelDescription' not in data:
                    data['modelDescription'] = ""
                    needs_update = True
                    
                # For checkpoint metadata
                if model_class == CheckpointMetadata and 'model_type' not in data:
                    data['model_type'] = "checkpoint"
                    needs_update = True
                
                # For lora metadata
                if model_class == LoraMetadata and 'usage_tips' not in data:
                    data['usage_tips'] = "{}"
                    needs_update = True
                
                # Update preview_nsfw_level if needed
                civitai_data = data.get('civitai', {})
                civitai_images = civitai_data.get('images', []) if civitai_data else []
                if (data.get('preview_url') and 
                    data.get('preview_nsfw_level', 0) == 0 and 
                    civitai_images and 
                    civitai_images[0].get('nsfwLevel', 0) != 0):
                    data['preview_nsfw_level'] = civitai_images[0]['nsfwLevel']
                    # TODO: write to metadata file
                    # needs_update = True

                if needs_update:
                    with open(metadata_path, 'w', encoding='utf-8') as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)
                
                return model_class.from_dict(data)
                
    except Exception as e:
        print(f"Error loading metadata from {metadata_path}: {str(e)}")
    return None

async def update_civitai_metadata(file_path: str, civitai_data: Dict) -> None:
    """Update metadata file with Civitai data"""
    metadata = await load_metadata(file_path)
    metadata['civitai'] = civitai_data
    await save_metadata(file_path, metadata)