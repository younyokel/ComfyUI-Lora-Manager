import logging
import os
import hashlib
import json
from typing import Dict, Optional

from .model_utils import determine_base_model

from .lora_metadata import extract_lora_metadata
from .models import LoraMetadata

logger = logging.getLogger(__name__)

async def calculate_sha256(file_path: str) -> str:
    """Calculate SHA256 hash of a file"""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def _find_preview_file(base_name: str, dir_path: str) -> str:
    """Find preview file for given base name in directory"""
    preview_patterns = [
        f"{base_name}.preview.png",
        f"{base_name}.preview.jpg",
        f"{base_name}.preview.jpeg",
        f"{base_name}.preview.mp4",
        f"{base_name}.png",
        f"{base_name}.jpg", 
        f"{base_name}.jpeg",
        f"{base_name}.mp4"
    ]
    
    for pattern in preview_patterns:
        full_pattern = os.path.join(dir_path, pattern)
        if os.path.exists(full_pattern):
            return full_pattern.replace(os.sep, "/")
    return ""

def normalize_path(path: str) -> str:
    """Normalize file path to use forward slashes"""
    return path.replace(os.sep, "/") if path else path

async def get_file_info(file_path: str) -> Optional[LoraMetadata]:
    """Get basic file information as LoraMetadata object"""
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
    
    preview_url = _find_preview_file(base_name, dir_path)

    try:
        metadata = LoraMetadata(
            file_name=base_name,
            model_name=base_name,
            file_path=normalize_path(file_path),
            size=os.path.getsize(real_path),
            modified=os.path.getmtime(real_path),
            sha256=await calculate_sha256(real_path),
            base_model="Unknown",  # Will be updated later
            usage_tips="",
            notes="",
            from_civitai=True,
            preview_url=normalize_path(preview_url),
            tags=[],
            modelDescription=""
        )

        # create metadata file
        base_model_info = await extract_lora_metadata(real_path)
        metadata.base_model = base_model_info['base_model']
        await save_metadata(file_path, metadata)
        
        return metadata
    except Exception as e:
        logger.error(f"Error getting file info for {file_path}: {e}")
        return None

async def save_metadata(file_path: str, metadata: LoraMetadata) -> None:
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

async def load_metadata(file_path: str) -> Optional[LoraMetadata]:
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
                
                preview_url = data.get('preview_url', '')
                if not preview_url or not os.path.exists(preview_url):
                    base_name = os.path.splitext(os.path.basename(file_path))[0]
                    dir_path = os.path.dirname(file_path)
                    new_preview_url = normalize_path(_find_preview_file(base_name, dir_path))
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
                
                if needs_update:
                    with open(metadata_path, 'w', encoding='utf-8') as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)
                
                return LoraMetadata.from_dict(data)
                
    except Exception as e:
        print(f"Error loading metadata from {metadata_path}: {str(e)}")
    return None

async def update_civitai_metadata(file_path: str, civitai_data: Dict) -> None:
    """Update metadata file with Civitai data"""
    metadata = await load_metadata(file_path)
    metadata['civitai'] = civitai_data
    await save_metadata(file_path, metadata)