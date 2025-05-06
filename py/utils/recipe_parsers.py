import json
import logging
import os
import re
from typing import Dict, List, Any, Optional, Tuple
from abc import ABC, abstractmethod
from ..config import config

logger = logging.getLogger(__name__)

# Constants for generation parameters
GEN_PARAM_KEYS = [
    'prompt',
    'negative_prompt', 
    'steps',
    'sampler',
    'cfg_scale',
    'seed',
    'size',
    'clip_skip',
]

# Valid Lora types
VALID_LORA_TYPES = ['lora', 'locon']

class RecipeMetadataParser(ABC):
    """Interface for parsing recipe metadata from image user comments"""

    METADATA_MARKER = None

    @abstractmethod
    def is_metadata_matching(self, user_comment: str) -> bool:
        """Check if the user comment matches the metadata format"""
        pass
    
    @abstractmethod
    async def parse_metadata(self, user_comment: str, recipe_scanner=None, civitai_client=None) -> Dict[str, Any]:
        """
        Parse metadata from user comment and return structured recipe data
        
        Args:
            user_comment: The EXIF UserComment string from the image
            recipe_scanner: Optional recipe scanner instance for local LoRA lookup
            civitai_client: Optional Civitai client for fetching model information
            
        Returns:
            Dict containing parsed recipe data with standardized format
        """
        pass
    
    async def populate_lora_from_civitai(self, lora_entry: Dict[str, Any], civitai_info_tuple: Tuple[Dict[str, Any], Optional[str]], 
                                         recipe_scanner=None, base_model_counts=None, hash_value=None) -> Optional[Dict[str, Any]]:
        """
        Populate a lora entry with information from Civitai API response
        
        Args:
            lora_entry: The lora entry to populate
            civitai_info_tuple: The response tuple from Civitai API (data, error_msg)
            recipe_scanner: Optional recipe scanner for local file lookup
            base_model_counts: Optional dict to track base model counts
            hash_value: Optional hash value to use if not available in civitai_info
            
        Returns:
            The populated lora_entry dict if type is valid, None otherwise
        """
        try:
            # Unpack the tuple to get the actual data
            civitai_info, error_msg = civitai_info_tuple if isinstance(civitai_info_tuple, tuple) else (civitai_info_tuple, None)
            
            if not civitai_info or civitai_info.get("error") == "Model not found":
                # Model not found or deleted
                lora_entry['isDeleted'] = True
                lora_entry['thumbnailUrl'] = '/loras_static/images/no-preview.png'
                return lora_entry
                
            # Get model type and validate
            model_type = civitai_info.get('model', {}).get('type', '').lower()
            lora_entry['type'] = model_type
            if model_type not in VALID_LORA_TYPES:
                logger.debug(f"Skipping non-LoRA model type: {model_type}")
                return None

            # Check if this is an early access lora
            if civitai_info.get('earlyAccessEndsAt'):
                # Convert earlyAccessEndsAt to a human-readable date
                early_access_date = civitai_info.get('earlyAccessEndsAt', '')
                lora_entry['isEarlyAccess'] = True
                lora_entry['earlyAccessEndsAt'] = early_access_date
                
            # Update model name if available
            if 'model' in civitai_info and 'name' in civitai_info['model']:
                lora_entry['name'] = civitai_info['model']['name']
            
            # Update version if available
            if 'name' in civitai_info:
                lora_entry['version'] = civitai_info.get('name', '')
            
            # Get thumbnail URL from first image
            if 'images' in civitai_info and civitai_info['images']:
                lora_entry['thumbnailUrl'] = civitai_info['images'][0].get('url', '')
            
            # Get base model
            current_base_model = civitai_info.get('baseModel', '')
            lora_entry['baseModel'] = current_base_model
            
            # Update base model counts if tracking them
            if base_model_counts is not None and current_base_model:
                base_model_counts[current_base_model] = base_model_counts.get(current_base_model, 0) + 1
            
            # Get download URL
            lora_entry['downloadUrl'] = civitai_info.get('downloadUrl', '')
            
            # Process file information if available
            if 'files' in civitai_info:
                # Find the primary model file (type="Model" and primary=true) in the files list
                model_file = next((file for file in civitai_info.get('files', []) 
                                    if file.get('type') == 'Model' and file.get('primary') == True), None)
                
                if model_file:
                    # Get size
                    lora_entry['size'] = model_file.get('sizeKB', 0) * 1024
                    
                    # Get SHA256 hash
                    sha256 = model_file.get('hashes', {}).get('SHA256', hash_value)
                    if sha256:
                        lora_entry['hash'] = sha256.lower()
                    
                    # Check if exists locally
                    if recipe_scanner and lora_entry['hash']:
                        lora_scanner = recipe_scanner._lora_scanner
                        exists_locally = lora_scanner.has_lora_hash(lora_entry['hash'])
                        if exists_locally:
                            try:
                                local_path = lora_scanner.get_lora_path_by_hash(lora_entry['hash'])
                                lora_entry['existsLocally'] = True
                                lora_entry['localPath'] = local_path
                                lora_entry['file_name'] = os.path.splitext(os.path.basename(local_path))[0]
                                
                                # Get thumbnail from local preview if available
                                lora_cache = await lora_scanner.get_cached_data()
                                lora_item = next((item for item in lora_cache.raw_data 
                                                    if item['sha256'].lower() == lora_entry['hash'].lower()), None)
                                if lora_item and 'preview_url' in lora_item:
                                    lora_entry['thumbnailUrl'] = config.get_preview_static_url(lora_item['preview_url'])
                            except Exception as e:
                                logger.error(f"Error getting local lora path: {e}")
                        else:
                            # For missing LoRAs, get file_name from model_file.name
                            file_name = model_file.get('name', '')
                            lora_entry['file_name'] = os.path.splitext(file_name)[0] if file_name else ''
                
        except Exception as e:
            logger.error(f"Error populating lora from Civitai info: {e}")
            
        return lora_entry
        
    async def populate_checkpoint_from_civitai(self, checkpoint: Dict[str, Any], civitai_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Populate checkpoint information from Civitai API response
        
        Args:
            checkpoint: The checkpoint entry to populate
            civitai_info: The response from Civitai API
            
        Returns:
            The populated checkpoint dict
        """
        try:
            if civitai_info and civitai_info.get("error") != "Model not found":
                # Update model name if available
                if 'model' in civitai_info and 'name' in civitai_info['model']:
                    checkpoint['name'] = civitai_info['model']['name']
                
                # Update version if available
                if 'name' in civitai_info:
                    checkpoint['version'] = civitai_info.get('name', '')
                
                # Get thumbnail URL from first image
                if 'images' in civitai_info and civitai_info['images']:
                    checkpoint['thumbnailUrl'] = civitai_info['images'][0].get('url', '')
                
                # Get base model
                checkpoint['baseModel'] = civitai_info.get('baseModel', '')
                
                # Get download URL
                checkpoint['downloadUrl'] = civitai_info.get('downloadUrl', '')
            else:
                # Model not found or deleted
                checkpoint['isDeleted'] = True
        except Exception as e:
            logger.error(f"Error populating checkpoint from Civitai info: {e}")
            
        return checkpoint


class RecipeFormatParser(RecipeMetadataParser):
    """Parser for images with dedicated recipe metadata format"""
    
    # Regular expression pattern for extracting recipe metadata
    METADATA_MARKER = r'Recipe metadata: (\{.*\})'
    
    def is_metadata_matching(self, user_comment: str) -> bool:
        """Check if the user comment matches the metadata format"""
        return re.search(self.METADATA_MARKER, user_comment, re.IGNORECASE | re.DOTALL) is not None
    
    async def parse_metadata(self, user_comment: str, recipe_scanner=None, civitai_client=None) -> Dict[str, Any]:
        """Parse metadata from images with dedicated recipe metadata format"""
        try:
            # Extract recipe metadata from user comment
            try:
                # Look for recipe metadata section
                recipe_match = re.search(self.METADATA_MARKER, user_comment, re.IGNORECASE | re.DOTALL)
                if not recipe_match:
                    recipe_metadata = None
                else:
                    recipe_json = recipe_match.group(1)
                    recipe_metadata = json.loads(recipe_json)
            except Exception as e:
                logger.error(f"Error extracting recipe metadata: {e}")
                recipe_metadata = None
            if not recipe_metadata:
                return {"error": "No recipe metadata found", "loras": []}
                
            # Process the recipe metadata
            loras = []
            for lora in recipe_metadata.get('loras', []):
                # Convert recipe lora format to frontend format
                lora_entry = {
                    'id': lora.get('modelVersionId', ''),
                    'name': lora.get('modelName', ''),
                    'version': lora.get('modelVersionName', ''),
                    'type': 'lora',
                    'weight': lora.get('strength', 1.0),
                    'file_name': lora.get('file_name', ''),
                    'hash': lora.get('hash', '')
                }
                
                # Check if this LoRA exists locally by SHA256 hash
                if lora.get('hash') and recipe_scanner:
                    lora_scanner = recipe_scanner._lora_scanner
                    exists_locally = lora_scanner.has_lora_hash(lora['hash'])
                    if exists_locally:
                        lora_cache = await lora_scanner.get_cached_data()
                        lora_item = next((item for item in lora_cache.raw_data if item['sha256'].lower() == lora['hash'].lower()), None)
                        if lora_item:
                            lora_entry['existsLocally'] = True
                            lora_entry['localPath'] = lora_item['file_path']
                            lora_entry['file_name'] = lora_item['file_name']
                            lora_entry['size'] = lora_item['size']
                            lora_entry['thumbnailUrl'] = config.get_preview_static_url(lora_item['preview_url'])
                            
                    else:
                        lora_entry['existsLocally'] = False
                        lora_entry['localPath'] = None
                        
                        # Try to get additional info from Civitai if we have a model version ID
                        if lora.get('modelVersionId') and civitai_client:
                            try:
                                civitai_info_tuple = await civitai_client.get_model_version_info(lora['modelVersionId'])
                                # Populate lora entry with Civitai info
                                populated_entry = await self.populate_lora_from_civitai(
                                    lora_entry, 
                                    civitai_info_tuple, 
                                    recipe_scanner,
                                    None,  # No need to track base model counts
                                    lora['hash']
                                )
                                if populated_entry is None:
                                    continue  # Skip invalid LoRA types
                                lora_entry = populated_entry
                            except Exception as e:
                                logger.error(f"Error fetching Civitai info for LoRA: {e}")
                                lora_entry['thumbnailUrl'] = '/loras_static/images/no-preview.png'
                
                loras.append(lora_entry)

            logger.info(f"Found {len(loras)} loras in recipe metadata")
            
            # Filter gen_params to only include recognized keys
            filtered_gen_params = {}
            if 'gen_params' in recipe_metadata:
                for key, value in recipe_metadata['gen_params'].items():
                    if key in GEN_PARAM_KEYS:
                        filtered_gen_params[key] = value
            
            return {
                'base_model': recipe_metadata.get('base_model', ''),
                'loras': loras,
                'gen_params': filtered_gen_params,
                'tags': recipe_metadata.get('tags', []),
                'title': recipe_metadata.get('title', ''),
                'from_recipe_metadata': True
            }
            
        except Exception as e:
            logger.error(f"Error parsing recipe format metadata: {e}", exc_info=True)
            return {"error": str(e), "loras": []}

class ComfyMetadataParser(RecipeMetadataParser):
    """Parser for Civitai ComfyUI metadata JSON format"""
    
    METADATA_MARKER = r"class_type"
    
    def is_metadata_matching(self, user_comment: str) -> bool:
        """Check if the user comment matches the ComfyUI metadata format"""
        try:
            data = json.loads(user_comment)
            # Check if it contains class_type nodes typical of ComfyUI workflow
            return isinstance(data, dict) and any(isinstance(v, dict) and 'class_type' in v for v in data.values())
        except (json.JSONDecodeError, TypeError):
            return False
    
    async def parse_metadata(self, user_comment: str, recipe_scanner=None, civitai_client=None) -> Dict[str, Any]:
        """Parse metadata from Civitai ComfyUI metadata format"""
        try:
            data = json.loads(user_comment)
            loras = []
            
            # Find all LoraLoader nodes
            lora_nodes = {k: v for k, v in data.items() if isinstance(v, dict) and v.get('class_type') == 'LoraLoader'}
            
            if not lora_nodes:
                return {"error": "No LoRA information found in this ComfyUI workflow", "loras": []}
            
            # Process each LoraLoader node
            for node_id, node in lora_nodes.items():
                if 'inputs' not in node or 'lora_name' not in node['inputs']:
                    continue
                    
                lora_name = node['inputs'].get('lora_name', '')
                
                # Parse the URN to extract model ID and version ID
                # Format: "urn:air:sdxl:lora:civitai:1107767@1253442"
                lora_id_match = re.search(r'civitai:(\d+)@(\d+)', lora_name)
                if not lora_id_match:
                    continue
                    
                model_id = lora_id_match.group(1)
                model_version_id = lora_id_match.group(2)
                
                # Get strength from node inputs
                weight = node['inputs'].get('strength_model', 1.0)
                
                # Initialize lora entry with default values
                lora_entry = {
                    'id': model_version_id,
                    'modelId': model_id,
                    'name': f"Lora {model_id}",  # Default name
                    'version': '',
                    'type': 'lora',
                    'weight': weight,
                    'existsLocally': False,
                    'localPath': None,
                    'file_name': '',
                    'hash': '',
                    'thumbnailUrl': '/loras_static/images/no-preview.png',
                    'baseModel': '',
                    'size': 0,
                    'downloadUrl': '',
                    'isDeleted': False
                }
                
                # Get additional info from Civitai if client is available
                if civitai_client:
                    try:
                        civitai_info_tuple = await civitai_client.get_model_version_info(model_version_id)
                        # Populate lora entry with Civitai info
                        populated_entry = await self.populate_lora_from_civitai(
                            lora_entry, 
                            civitai_info_tuple, 
                            recipe_scanner
                        )
                        if populated_entry is None:
                            continue  # Skip invalid LoRA types
                        lora_entry = populated_entry
                    except Exception as e:
                        logger.error(f"Error fetching Civitai info for LoRA: {e}")
                
                loras.append(lora_entry)
            
            # Find checkpoint info
            checkpoint_nodes = {k: v for k, v in data.items() if isinstance(v, dict) and v.get('class_type') == 'CheckpointLoaderSimple'}
            checkpoint = None
            checkpoint_id = None
            checkpoint_version_id = None
            
            if checkpoint_nodes:
                # Get the first checkpoint node
                checkpoint_node = next(iter(checkpoint_nodes.values()))
                if 'inputs' in checkpoint_node and 'ckpt_name' in checkpoint_node['inputs']:
                    checkpoint_name = checkpoint_node['inputs']['ckpt_name']
                    # Parse checkpoint URN
                    checkpoint_match = re.search(r'civitai:(\d+)@(\d+)', checkpoint_name)
                    if checkpoint_match:
                        checkpoint_id = checkpoint_match.group(1)
                        checkpoint_version_id = checkpoint_match.group(2)
                        checkpoint = {
                            'id': checkpoint_version_id,
                            'modelId': checkpoint_id,
                            'name': f"Checkpoint {checkpoint_id}",
                            'version': '',
                            'type': 'checkpoint'
                        }
                        
                        # Get additional checkpoint info from Civitai
                        if civitai_client:
                            try:
                                civitai_info_tuple = await civitai_client.get_model_version_info(checkpoint_version_id)
                                civitai_info, _ = civitai_info_tuple if isinstance(civitai_info_tuple, tuple) else (civitai_info_tuple, None)
                                # Populate checkpoint with Civitai info
                                checkpoint = await self.populate_checkpoint_from_civitai(checkpoint, civitai_info)
                            except Exception as e:
                                logger.error(f"Error fetching Civitai info for checkpoint: {e}")
            
            # Extract generation parameters
            gen_params = {}
            
            # First try to get from extraMetadata
            if 'extraMetadata' in data:
                try:
                    # extraMetadata is a JSON string that needs to be parsed
                    extra_metadata = json.loads(data['extraMetadata'])
                    
                    # Map fields from extraMetadata to our standard format
                    mapping = {
                        'prompt': 'prompt',
                        'negativePrompt': 'negative_prompt',
                        'steps': 'steps',
                        'sampler': 'sampler',
                        'cfgScale': 'cfg_scale',
                        'seed': 'seed'
                    }
                    
                    for src_key, dest_key in mapping.items():
                        if src_key in extra_metadata:
                            gen_params[dest_key] = extra_metadata[src_key]
                    
                    # If size info is available, format as "width x height"
                    if 'width' in extra_metadata and 'height' in extra_metadata:
                        gen_params['size'] = f"{extra_metadata['width']}x{extra_metadata['height']}"
                    
                except Exception as e:
                    logger.error(f"Error parsing extraMetadata: {e}")
            
            # If extraMetadata doesn't have all the info, try to get from nodes
            if not gen_params or len(gen_params) < 3:  # At least we want prompt, negative_prompt, and steps
                # Find positive prompt node
                positive_nodes = {k: v for k, v in data.items() if isinstance(v, dict) and 
                                v.get('class_type', '').endswith('CLIPTextEncode') and 
                                v.get('_meta', {}).get('title') == 'Positive'}
                
                if positive_nodes:
                    positive_node = next(iter(positive_nodes.values()))
                    if 'inputs' in positive_node and 'text' in positive_node['inputs']:
                        gen_params['prompt'] = positive_node['inputs']['text']
                
                # Find negative prompt node
                negative_nodes = {k: v for k, v in data.items() if isinstance(v, dict) and 
                                v.get('class_type', '').endswith('CLIPTextEncode') and 
                                v.get('_meta', {}).get('title') == 'Negative'}
                
                if negative_nodes:
                    negative_node = next(iter(negative_nodes.values()))
                    if 'inputs' in negative_node and 'text' in negative_node['inputs']:
                        gen_params['negative_prompt'] = negative_node['inputs']['text']
                
                # Find KSampler node for other parameters
                ksampler_nodes = {k: v for k, v in data.items() if isinstance(v, dict) and v.get('class_type') == 'KSampler'}
                
                if ksampler_nodes:
                    ksampler_node = next(iter(ksampler_nodes.values()))
                    if 'inputs' in ksampler_node:
                        inputs = ksampler_node['inputs']
                        if 'sampler_name' in inputs:
                            gen_params['sampler'] = inputs['sampler_name']
                        if 'steps' in inputs:
                            gen_params['steps'] = inputs['steps']
                        if 'cfg' in inputs:
                            gen_params['cfg_scale'] = inputs['cfg']
                        if 'seed' in inputs:
                            gen_params['seed'] = inputs['seed']
            
            # Determine base model from loras info
            base_model = None
            if loras:
                # Use the most common base model from loras
                base_models = [lora['baseModel'] for lora in loras if lora.get('baseModel')]
                if base_models:
                    from collections import Counter
                    base_model_counts = Counter(base_models)
                    base_model = base_model_counts.most_common(1)[0][0]
            
            return {
                'base_model': base_model,
                'loras': loras,
                'checkpoint': checkpoint,
                'gen_params': gen_params,
                'from_comfy_metadata': True
            }
            
        except Exception as e:
            logger.error(f"Error parsing ComfyUI metadata: {e}", exc_info=True)
            return {"error": str(e), "loras": []}


class MetaFormatParser(RecipeMetadataParser):
    """Parser for images with meta format metadata (Lora_N Model hash format)"""
    
    METADATA_MARKER = r'Lora_\d+ Model hash:'
    
    def is_metadata_matching(self, user_comment: str) -> bool:
        """Check if the user comment matches the metadata format"""
        return re.search(self.METADATA_MARKER, user_comment, re.IGNORECASE | re.DOTALL) is not None
    
    async def parse_metadata(self, user_comment: str, recipe_scanner=None, civitai_client=None) -> Dict[str, Any]:
        """Parse metadata from images with meta format metadata"""
        try:
            # Extract prompt and negative prompt
            parts = user_comment.split('Negative prompt:', 1)
            prompt = parts[0].strip()
            
            # Initialize metadata
            metadata = {"prompt": prompt, "loras": []}
            
            # Extract negative prompt and parameters if available
            if len(parts) > 1:
                negative_and_params = parts[1]
                
                # Extract negative prompt - everything until the first parameter (usually "Steps:")
                param_start = re.search(r'([A-Za-z]+): ', negative_and_params)
                if param_start:
                    neg_prompt = negative_and_params[:param_start.start()].strip()
                    metadata["negative_prompt"] = neg_prompt
                    params_section = negative_and_params[param_start.start():]
                else:
                    params_section = negative_and_params
                
                # Extract key-value parameters (Steps, Sampler, Seed, etc.)
                param_pattern = r'([A-Za-z_0-9 ]+): ([^,]+)'
                params = re.findall(param_pattern, params_section)
                for key, value in params:
                    clean_key = key.strip().lower().replace(' ', '_')
                    metadata[clean_key] = value.strip()
            
            # Extract LoRA information
            # Pattern to match lora entries: Lora_0 Model name: ArtVador I.safetensors, Lora_0 Model hash: 08f7133a58, etc.
            lora_pattern = r'Lora_(\d+) Model name: ([^,]+), Lora_\1 Model hash: ([^,]+), Lora_\1 Strength model: ([^,]+), Lora_\1 Strength clip: ([^,]+)'
            lora_matches = re.findall(lora_pattern, user_comment)
            
            # If the regular pattern doesn't match, try a more flexible approach
            if not lora_matches:
                # First find all Lora indices
                lora_indices = set(re.findall(r'Lora_(\d+)', user_comment))
                
                # For each index, extract the information
                for idx in lora_indices:
                    lora_info = {}
                    
                    # Extract model name
                    name_match = re.search(f'Lora_{idx} Model name: ([^,]+)', user_comment)
                    if name_match:
                        lora_info['name'] = name_match.group(1).strip()
                    
                    # Extract model hash
                    hash_match = re.search(f'Lora_{idx} Model hash: ([^,]+)', user_comment)
                    if hash_match:
                        lora_info['hash'] = hash_match.group(1).strip()
                    
                    # Extract strength model
                    strength_model_match = re.search(f'Lora_{idx} Strength model: ([^,]+)', user_comment)
                    if strength_model_match:
                        lora_info['strength_model'] = float(strength_model_match.group(1).strip())
                    
                    # Extract strength clip
                    strength_clip_match = re.search(f'Lora_{idx} Strength clip: ([^,]+)', user_comment)
                    if strength_clip_match:
                        lora_info['strength_clip'] = float(strength_clip_match.group(1).strip())
                    
                    # Only add if we have at least name and hash
                    if 'name' in lora_info and 'hash' in lora_info:
                        lora_matches.append((idx, lora_info['name'], lora_info['hash'], 
                                            str(lora_info.get('strength_model', 1.0)), 
                                            str(lora_info.get('strength_clip', 1.0))))
            
            # Process LoRAs
            base_model_counts = {}
            loras = []
            
            for match in lora_matches:
                if len(match) == 5:  # Regular pattern match
                    idx, name, hash_value, strength_model, strength_clip = match
                else:  # Flexible approach match
                    continue  # Should not happen now
                
                # Clean up the values
                name = name.strip()
                if name.endswith('.safetensors'):
                    name = name[:-12]  # Remove .safetensors extension
                    
                hash_value = hash_value.strip()
                weight = float(strength_model)  # Use model strength as weight
                
                # Initialize lora entry with default values
                lora_entry = {
                    'name': name,
                    'type': 'lora',
                    'weight': weight,
                    'existsLocally': False,
                    'localPath': None,
                    'file_name': name,
                    'hash': hash_value,
                    'thumbnailUrl': '/loras_static/images/no-preview.png',
                    'baseModel': '',
                    'size': 0,
                    'downloadUrl': '',
                    'isDeleted': False
                }
                
                # Get info from Civitai by hash if available
                if civitai_client and hash_value:
                    try:
                        civitai_info = await civitai_client.get_model_by_hash(hash_value)
                        # Populate lora entry with Civitai info
                        populated_entry = await self.populate_lora_from_civitai(
                            lora_entry, 
                            civitai_info, 
                            recipe_scanner,
                            base_model_counts,
                            hash_value
                        )
                        if populated_entry is None:
                            continue  # Skip invalid LoRA types
                        lora_entry = populated_entry
                    except Exception as e:
                        logger.error(f"Error fetching Civitai info for LoRA hash {hash_value}: {e}")
                
                loras.append(lora_entry)
            
            # Extract model information
            model = None
            if 'model' in metadata:
                model = metadata['model']
            
            # Set base_model to the most common one from civitai_info
            base_model = None
            if base_model_counts:
                base_model = max(base_model_counts.items(), key=lambda x: x[1])[0]
            
            # Extract generation parameters for recipe metadata
            gen_params = {}
            for key in GEN_PARAM_KEYS:
                if key in metadata:
                    gen_params[key] = metadata.get(key, '')
            
            # Try to extract size information if available
            if 'width' in metadata and 'height' in metadata:
                gen_params['size'] = f"{metadata['width']}x{metadata['height']}"
            
            return {
                'base_model': base_model,
                'loras': loras,
                'gen_params': gen_params,
                'raw_metadata': metadata,
                'from_meta_format': True
            }
            
        except Exception as e:
            logger.error(f"Error parsing meta format metadata: {e}", exc_info=True)
            return {"error": str(e), "loras": []}

class AutomaticMetadataParser(RecipeMetadataParser):
    """Parser for Automatic1111 metadata format"""
    
    METADATA_MARKER = r"Steps: \d+"
    
    # Regular expressions for extracting specific metadata
    HASHES_REGEX = r', Hashes:\s*({[^}]+})'
    CIVITAI_RESOURCES_REGEX = r', Civitai resources:\s*(\[\{.*?\}\])'
    CIVITAI_METADATA_REGEX = r', Civitai metadata:\s*(\{.*?\})'
    EXTRANETS_REGEX = r'<(lora|hypernet):([a-zA-Z0-9_\.\-]+):([0-9.]+)>'
    MODEL_HASH_PATTERN = r'Model hash: ([a-zA-Z0-9]+)'
    VAE_HASH_PATTERN = r'VAE hash: ([a-zA-Z0-9]+)'
    
    def is_metadata_matching(self, user_comment: str) -> bool:
        """Check if the user comment matches the Automatic1111 format"""
        # Match if it has Steps pattern and either has "Negative prompt:" or "Civitai resources:"
        return (re.search(self.METADATA_MARKER, user_comment) is not None and 
                ("Negative prompt:" in user_comment or re.search(self.CIVITAI_RESOURCES_REGEX, user_comment) is not None))
    
    async def parse_metadata(self, user_comment: str, recipe_scanner=None, civitai_client=None) -> Dict[str, Any]:
        """Parse metadata from Automatic1111 format"""
        try:
            # Split on Negative prompt if it exists
            if "Negative prompt:" in user_comment:
                parts = user_comment.split('Negative prompt:', 1)
                prompt = parts[0].strip()
                negative_and_params = parts[1] if len(parts) > 1 else ""
            else:
                # No negative prompt section
                param_start = re.search(self.METADATA_MARKER, user_comment)
                if param_start:
                    prompt = user_comment[:param_start.start()].strip()
                    negative_and_params = user_comment[param_start.start():]
                else:
                    prompt = user_comment.strip()
                    negative_and_params = ""
            
            # Initialize metadata
            metadata = {
                "prompt": prompt,
                "loras": []
            }
            
            # Extract negative prompt and parameters
            if negative_and_params:
                # If we split on "Negative prompt:", check for params section
                if "Negative prompt:" in user_comment:
                    param_start = re.search(r'Steps: ', negative_and_params)
                    if param_start:
                        neg_prompt = negative_and_params[:param_start.start()].strip()
                        metadata["negative_prompt"] = neg_prompt
                        params_section = negative_and_params[param_start.start():]
                    else:
                        metadata["negative_prompt"] = negative_and_params.strip()
                        params_section = ""
                else:
                    # No negative prompt, entire section is params
                    params_section = negative_and_params
                
                # Extract generation parameters
                if params_section:
                    # Extract Civitai resources
                    civitai_resources_match = re.search(self.CIVITAI_RESOURCES_REGEX, params_section)
                    if civitai_resources_match:
                        try:
                            civitai_resources = json.loads(civitai_resources_match.group(1))
                            metadata["civitai_resources"] = civitai_resources
                            params_section = params_section.replace(civitai_resources_match.group(0), '')
                        except json.JSONDecodeError:
                            logger.error("Error parsing Civitai resources JSON")
                    
                    # Extract Hashes
                    hashes_match = re.search(self.HASHES_REGEX, params_section)
                    if hashes_match:
                        try:
                            hashes = json.loads(hashes_match.group(1))
                            metadata["hashes"] = hashes
                            # Remove hashes from params section to not interfere with other parsing
                            params_section = params_section.replace(hashes_match.group(0), '')
                        except json.JSONDecodeError:
                            logger.error("Error parsing hashes JSON")
                    
                    # Extract basic parameters
                    param_pattern = r'([A-Za-z\s]+): ([^,]+)'
                    params = re.findall(param_pattern, params_section)
                    gen_params = {}
                    
                    for key, value in params:
                        clean_key = key.strip().lower().replace(' ', '_')
                        
                        # Skip if not in recognized gen param keys
                        if clean_key not in GEN_PARAM_KEYS:
                            continue
                            
                        # Convert numeric values
                        if clean_key in ['steps', 'seed']:
                            try:
                                gen_params[clean_key] = int(value.strip())
                            except ValueError:
                                gen_params[clean_key] = value.strip()
                        elif clean_key in ['cfg_scale']:
                            try:
                                gen_params[clean_key] = float(value.strip())
                            except ValueError:
                                gen_params[clean_key] = value.strip()
                        else:
                            gen_params[clean_key] = value.strip()
                    
                    # Extract size if available and add to gen_params if a recognized key
                    size_match = re.search(r'Size: (\d+)x(\d+)', params_section)
                    if size_match and 'size' in GEN_PARAM_KEYS:
                        width, height = size_match.groups()
                        gen_params['size'] = f"{width}x{height}"
                    
                    # Add prompt and negative_prompt to gen_params if they're in GEN_PARAM_KEYS
                    if 'prompt' in GEN_PARAM_KEYS and 'prompt' in metadata:
                        gen_params['prompt'] = metadata['prompt']
                    if 'negative_prompt' in GEN_PARAM_KEYS and 'negative_prompt' in metadata:
                        gen_params['negative_prompt'] = metadata['negative_prompt']
                    
                    metadata["gen_params"] = gen_params
            
            # Extract LoRA information 
            loras = []
            base_model_counts = {}
            
            # First use Civitai resources if available (more reliable source)
            if metadata.get("civitai_resources"):
                for resource in metadata.get("civitai_resources", []):
                    if resource.get("type") in ["lora", "hypernet"] and resource.get("modelVersionId"):
                        # Initialize lora entry
                        lora_entry = {
                            'id': str(resource.get("modelVersionId")),
                            'modelId': str(resource.get("modelId")) if resource.get("modelId") else None,
                            'name': resource.get("modelName", "Unknown LoRA"),
                            'version': resource.get("modelVersionName", ""),
                            'type': resource.get("type", "lora"),
                            'weight': float(resource.get("weight", 1.0)),
                            'existsLocally': False,
                            'thumbnailUrl': '/loras_static/images/no-preview.png',
                            'baseModel': '',
                            'size': 0,
                            'downloadUrl': '',
                            'isDeleted': False
                        }
                        
                        # Get additional info from Civitai
                        if civitai_client:
                            try:
                                civitai_info = await civitai_client.get_model_version_info(resource.get("modelVersionId"))
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
                                logger.error(f"Error fetching Civitai info for LoRA {lora_entry['name']}: {e}")
                        
                        loras.append(lora_entry)
            
            # If no LoRAs from Civitai resources or to supplement, extract from prompt tags
            if not loras or len(loras) == 0:
                # Extract LoRAs from extranet tags in prompt
                lora_matches = re.findall(self.EXTRANETS_REGEX, prompt)
                for lora_type, lora_name, lora_weight in lora_matches:
                    # Initialize lora entry
                    lora_entry = {
                        'name': lora_name,
                        'type': lora_type,  # 'lora' or 'hypernet'
                        'weight': float(lora_weight),
                        'existsLocally': False,
                        'localPath': None,
                        'file_name': lora_name,
                        'thumbnailUrl': '/loras_static/images/no-preview.png',
                        'baseModel': '',
                        'size': 0,
                        'downloadUrl': '',
                        'isDeleted': False
                    }
                    
                    # Check for hash from hashes dict
                    lora_hash = None
                    if metadata.get("hashes") and f"{lora_type}:{lora_name}" in metadata["hashes"]:
                        lora_hash = metadata["hashes"][f"{lora_type}:{lora_name}"]
                        lora_entry['hash'] = lora_hash
                    
                    # Get additional info from Civitai either by hash or by checking civitai_resources
                    model_version_id = None
                    
                    # First check if we have model version ID from civitai_resources
                    if metadata.get("civitai_resources"):
                        for resource in metadata["civitai_resources"]:
                            if (lora_type == resource.get("type") and 
                                (lora_name.lower() in resource.get("modelName", "").lower() or 
                                 resource.get("modelName", "").lower() in lora_name.lower()) and
                                resource.get("modelVersionId")):
                                model_version_id = resource.get("modelVersionId")
                                lora_entry['id'] = str(model_version_id)
                                break
                    
                    # Try to get info from Civitai
                    if civitai_client:
                        try:
                            if lora_hash:
                                # If we have hash, use it for lookup
                                civitai_info = await civitai_client.get_model_by_hash(lora_hash)
                            elif model_version_id:
                                # If we have model version ID, use that
                                civitai_info = await civitai_client.get_model_version_info(model_version_id)
                            else:
                                civitai_info = None
                            
                            # Populate lora entry with Civitai info if available
                            if civitai_info:
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
                            logger.error(f"Error fetching Civitai info for LoRA {lora_name}: {e}")
                    
                    # Check if we can find it locally
                    if lora_hash and recipe_scanner:
                        lora_scanner = recipe_scanner._lora_scanner
                        exists_locally = lora_scanner.has_lora_hash(lora_hash)
                        if exists_locally:
                            try:
                                lora_cache = await lora_scanner.get_cached_data()
                                lora_item = next((item for item in lora_cache.raw_data 
                                                 if item['sha256'].lower() == lora_hash.lower()), None)
                                if lora_item:
                                    lora_entry['existsLocally'] = True
                                    lora_entry['localPath'] = lora_item['file_path']
                                    lora_entry['file_name'] = lora_item['file_name']
                                    lora_entry['size'] = lora_item['size']
                                    if 'preview_url' in lora_item:
                                        lora_entry['thumbnailUrl'] = config.get_preview_static_url(lora_item['preview_url'])
                            except Exception as e:
                                logger.error(f"Error getting local lora path: {e}")
                    
                    loras.append(lora_entry)
            
            # Try to get base model from resources or make educated guess
            base_model = None
            if base_model_counts:
                # Use the most common base model from the loras
                base_model = max(base_model_counts.items(), key=lambda x: x[1])[0]
            
            # Prepare final result structure
            # Make sure gen_params only contains recognized keys
            filtered_gen_params = {}
            for key in GEN_PARAM_KEYS:
                if key in metadata.get("gen_params", {}):
                    filtered_gen_params[key] = metadata["gen_params"][key]
            
            result = {
                'base_model': base_model,
                'loras': loras,
                'gen_params': filtered_gen_params,
                'from_automatic_metadata': True
            }
            
            return result
            
        except Exception as e:
            logger.error(f"Error parsing Automatic1111 metadata: {e}", exc_info=True)
            return {"error": str(e), "loras": []}

class RecipeParserFactory:
    """Factory for creating recipe metadata parsers"""
    
    @staticmethod
    def create_parser(user_comment: str) -> RecipeMetadataParser:
        """
        Create appropriate parser based on the user comment content
        
        Args:
            user_comment: The EXIF UserComment string from the image
            
        Returns:
            Appropriate RecipeMetadataParser implementation
        """
        # Try ComfyMetadataParser first since it requires valid JSON
        try:
            if ComfyMetadataParser().is_metadata_matching(user_comment):
                return ComfyMetadataParser()
        except Exception:
            # If JSON parsing fails, move on to other parsers
            pass
            
        if RecipeFormatParser().is_metadata_matching(user_comment):
            return RecipeFormatParser()
        elif AutomaticMetadataParser().is_metadata_matching(user_comment):
            return AutomaticMetadataParser()
        elif MetaFormatParser().is_metadata_matching(user_comment):
            return MetaFormatParser()
        else:
            return None
