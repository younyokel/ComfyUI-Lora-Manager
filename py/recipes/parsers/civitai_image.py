"""Parser for Civitai image metadata format."""

import json
import logging
from typing import Dict, Any, Union
from ..base import RecipeMetadataParser
from ..constants import GEN_PARAM_KEYS

logger = logging.getLogger(__name__)

class CivitaiApiMetadataParser(RecipeMetadataParser):
    """Parser for Civitai image metadata format"""
    
    def is_metadata_matching(self, metadata) -> bool:
        """Check if the metadata matches the Civitai image metadata format
        
        Args:
            metadata: The metadata from the image (dict)
            
        Returns:
            bool: True if this parser can handle the metadata
        """
        if not metadata or not isinstance(metadata, dict):
            return False
            
        # Check for key markers specific to Civitai image metadata
        return any([
            "resources" in metadata,
            "civitaiResources" in metadata,
            "additionalResources" in metadata
        ])
    
    async def parse_metadata(self, metadata, recipe_scanner=None, civitai_client=None) -> Dict[str, Any]:
        """Parse metadata from Civitai image format
        
        Args:
            metadata: The metadata from the image (dict)
            recipe_scanner: Optional recipe scanner service
            civitai_client: Optional Civitai API client
            
        Returns:
            Dict containing parsed recipe data
        """
        try:
            # Initialize result structure
            result = {
                'base_model': None,
                'loras': [],
                'gen_params': {},
                'from_civitai_image': True
            }
            
            # Extract prompt and negative prompt
            if "prompt" in metadata:
                result["gen_params"]["prompt"] = metadata["prompt"]
            
            if "negativePrompt" in metadata:
                result["gen_params"]["negative_prompt"] = metadata["negativePrompt"]
            
            # Extract other generation parameters
            param_mapping = {
                "steps": "steps",
                "sampler": "sampler",
                "cfgScale": "cfg_scale",
                "seed": "seed",
                "Size": "size",
                "clipSkip": "clip_skip",
            }
            
            for civitai_key, our_key in param_mapping.items():
                if civitai_key in metadata and our_key in GEN_PARAM_KEYS:
                    result["gen_params"][our_key] = metadata[civitai_key]
            
            # Extract base model information - directly if available
            if "baseModel" in metadata:
                result["base_model"] = metadata["baseModel"]
            elif "Model hash" in metadata and civitai_client:
                model_hash = metadata["Model hash"]
                model_info = await civitai_client.get_model_by_hash(model_hash)
                if model_info:
                    result["base_model"] = model_info.get("baseModel", "")
            elif "Model" in metadata and isinstance(metadata.get("resources"), list):
                # Try to find base model in resources
                for resource in metadata.get("resources", []):
                    if resource.get("type") == "model" and resource.get("name") == metadata.get("Model"):
                        # This is likely the checkpoint model
                        if civitai_client and resource.get("hash"):
                            model_info = await civitai_client.get_model_by_hash(resource.get("hash"))
                            if model_info:
                                result["base_model"] = model_info.get("baseModel", "")
            
            base_model_counts = {}
            
            # Process standard resources array
            if "resources" in metadata and isinstance(metadata["resources"], list):
                for resource in metadata["resources"]:
                    # Modified to process resources without a type field as potential LoRAs
                    if resource.get("type", "lora") == "lora":
                        lora_entry = {
                            'name': resource.get("name", "Unknown LoRA"),
                            'type': "lora",
                            'weight': float(resource.get("weight", 1.0)),
                            'hash': resource.get("hash", ""),
                            'existsLocally': False,
                            'localPath': None,
                            'file_name': resource.get("name", "Unknown"),
                            'thumbnailUrl': '/loras_static/images/no-preview.png',
                            'baseModel': '',
                            'size': 0,
                            'downloadUrl': '',
                            'isDeleted': False
                        }
                        
                        # Try to get info from Civitai if hash is available
                        if lora_entry['hash'] and civitai_client:
                            try:
                                lora_hash = lora_entry['hash']
                                civitai_info = await civitai_client.get_model_by_hash(lora_hash)
                                
                                populated_entry = await self.populate_lora_from_civitai(
                                    lora_entry,
                                    civitai_info,
                                    recipe_scanner,
                                    base_model_counts,
                                    lora_hash
                                )
                                
                                if populated_entry is None:
                                    continue  # Skip invalid LoRA types
                                    
                                lora_entry = populated_entry
                            except Exception as e:
                                logger.error(f"Error fetching Civitai info for LoRA hash {lora_entry['hash']}: {e}")
                        
                        result["loras"].append(lora_entry)
            
            # Process civitaiResources array
            if "civitaiResources" in metadata and isinstance(metadata["civitaiResources"], list):
                for resource in metadata["civitaiResources"]:
                    # Modified to process resources without a type field as potential LoRAs
                    if resource.get("type") in ["lora", "lycoris"] or "type" not in resource:
                        # Initialize lora entry with the same structure as in automatic.py
                        lora_entry = {
                            'id': str(resource.get("modelVersionId")),
                            'modelId': str(resource.get("modelId")) if resource.get("modelId") else None,
                            'name': resource.get("modelName", "Unknown LoRA"),
                            'version': resource.get("modelVersionName", ""),
                            'type': resource.get("type", "lora"),
                            'weight': round(float(resource.get("weight", 1.0)), 2),
                            'existsLocally': False,
                            'thumbnailUrl': '/loras_static/images/no-preview.png',
                            'baseModel': '',
                            'size': 0,
                            'downloadUrl': '',
                            'isDeleted': False
                        }
                        
                        # Try to get info from Civitai if modelVersionId is available
                        if resource.get('modelVersionId') and civitai_client:
                            try:
                                version_id = str(resource.get('modelVersionId'))
                                # Use get_model_version_info instead of get_model_version
                                civitai_info, error = await civitai_client.get_model_version_info(version_id)
                                
                                if error:
                                    logger.warning(f"Error getting model version info: {error}")
                                    continue
                                
                                populated_entry = await self.populate_lora_from_civitai(
                                    lora_entry,
                                    civitai_info,
                                    recipe_scanner,
                                    base_model_counts
                                )
                                
                                if populated_entry is None:
                                    continue  # Skip invalid LoRA types
                                    
                                lora_entry = populated_entry
                            except Exception as e:
                                logger.error(f"Error fetching Civitai info for model version {resource.get('modelVersionId')}: {e}")
                        
                        result["loras"].append(lora_entry)
            
            # Process additionalResources array
            if "additionalResources" in metadata and isinstance(metadata["additionalResources"], list):
                for resource in metadata["additionalResources"]:
                    # Modified to process resources without a type field as potential LoRAs
                    if resource.get("type") in ["lora", "lycoris"] or "type" not in resource:
                        lora_type = resource.get("type", "lora")
                        name = resource.get("name", "")
                        
                        # Extract ID from URN format if available
                        model_id = None
                        if name and "civitai:" in name:
                            parts = name.split("@")
                            if len(parts) > 1:
                                model_id = parts[1]
                        
                        lora_entry = {
                            'name': name,
                            'type': lora_type,
                            'weight': float(resource.get("strength", 1.0)),
                            'hash': "",
                            'existsLocally': False,
                            'localPath': None,
                            'file_name': name,
                            'thumbnailUrl': '/loras_static/images/no-preview.png',
                            'baseModel': '',
                            'size': 0,
                            'downloadUrl': '',
                            'isDeleted': False
                        }
                        
                        # If we have a model ID and civitai client, try to get more info
                        if model_id and civitai_client:
                            try:
                                # Use get_model_version_info with the model ID
                                civitai_info, error = await civitai_client.get_model_version_info(model_id)
                                
                                if error:
                                    logger.warning(f"Error getting model version info: {error}")
                                else:
                                    populated_entry = await self.populate_lora_from_civitai(
                                        lora_entry,
                                        civitai_info,
                                        recipe_scanner,
                                        base_model_counts
                                    )
                                    
                                    if populated_entry is None:
                                        continue  # Skip invalid LoRA types
                                        
                                    lora_entry = populated_entry
                            except Exception as e:
                                logger.error(f"Error fetching Civitai info for model ID {model_id}: {e}")
                        
                        result["loras"].append(lora_entry)
            
            # If base model wasn't found earlier, use the most common one from LoRAs
            if not result["base_model"] and base_model_counts:
                result["base_model"] = max(base_model_counts.items(), key=lambda x: x[1])[0]
            
            return result
            
        except Exception as e:
            logger.error(f"Error parsing Civitai image metadata: {e}", exc_info=True)
            return {"error": str(e), "loras": []}
