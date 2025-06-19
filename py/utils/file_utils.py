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