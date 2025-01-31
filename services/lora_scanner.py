import os
import logging
from typing import List, Dict
from ..config import config
from ..utils.file_utils import load_metadata, get_file_info, save_metadata
from ..utils.lora_metadata import extract_lora_metadata

logger = logging.getLogger(__name__)

class LoraScanner:
    """Service for scanning and managing LoRA files"""

    async def scan_all_loras(self) -> List[Dict]:
        """Scan all LoRA directories and return metadata"""
        all_loras = []
        
        for loras_root in config.loras_roots:
            try:
                loras = await self._scan_directory(loras_root)
                all_loras.extend(loras)
            except Exception as e:
                logger.error(f"Error scanning directory {loras_root}: {e}")
                
        return all_loras

    async def _scan_directory(self, root_path: str) -> List[Dict]:
        """Scan a single directory for LoRA files"""
        loras = []
        
        for root, _, files in os.walk(root_path):
            for filename in (f for f in files if f.endswith('.safetensors')):
                try:
                    file_path = os.path.join(root, filename).replace(os.sep, "/")
                    lora_data = await self._process_lora_file(file_path, root_path)
                    if lora_data:
                        loras.append(lora_data)
                except Exception as e:
                    logger.error(f"Error processing {filename}: {e}")
                    
        return loras

    async def _process_lora_file(self, file_path: str, root_path: str) -> Dict:
        """Process a single LoRA file and return its metadata"""
        # Try loading existing metadata
        metadata = await load_metadata(file_path)
        
        if metadata is None:
            # Create new metadata if none exists
            metadata = await get_file_info(file_path)
            base_model_info = await extract_lora_metadata(file_path)
            metadata.base_model = base_model_info['base_model']
            await save_metadata(file_path, metadata)
        
        # Convert to dict and add folder info
        lora_data = metadata.to_dict()
        rel_path = os.path.relpath(file_path, root_path)
        folder = os.path.dirname(rel_path)
        lora_data['folder'] = folder.replace(os.path.sep, '/')
        
        return lora_data
