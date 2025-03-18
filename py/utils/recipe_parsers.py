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
                
            logger.info("Found existing recipe metadata in image")
            
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
                        lora_item = next((item for item in lora_cache.raw_data if item['sha256'] == lora['hash']), None)
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
                                civitai_info = await civitai_client.get_model_version_info(lora['modelVersionId'])
                                if civitai_info and civitai_info.get("error") != "Model not found":
                                    # Get thumbnail URL from first image
                                    if 'images' in civitai_info and civitai_info['images']:
                                        lora_entry['thumbnailUrl'] = civitai_info['images'][0].get('url', '')
                                    
                                    # Get base model
                                    lora_entry['baseModel'] = civitai_info.get('baseModel', '')
                                    
                                    # Get download URL
                                    lora_entry['downloadUrl'] = civitai_info.get('downloadUrl', '')
                                    
                                    # Get size from files if available
                                    if 'files' in civitai_info:
                                        model_file = next((file for file in civitai_info.get('files', []) 
                                                        if file.get('type') == 'Model'), None)
                                        if model_file:
                                            lora_entry['size'] = model_file.get('sizeKB', 0) * 1024
                                else:
                                    lora_entry['isDeleted'] = True
                                    lora_entry['thumbnailUrl'] = '/loras_static/images/no-preview.png'
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


class StandardMetadataParser(RecipeMetadataParser):
    """Parser for images with standard civitai metadata format (prompt, negative prompt, etc.)"""

    METADATA_MARKER = r'Civitai resources: '

    def is_metadata_matching(self, user_comment: str) -> bool:
        """Check if the user comment matches the metadata format"""
        return re.search(self.METADATA_MARKER, user_comment, re.IGNORECASE | re.DOTALL) is not None
    
    async def parse_metadata(self, user_comment: str, recipe_scanner=None, civitai_client=None) -> Dict[str, Any]:
        """Parse metadata from images with standard metadata format"""
        try:
            # Parse the standard metadata
            metadata = self._parse_recipe_metadata(user_comment)
            
            # Look for Civitai resources in the metadata
            civitai_resources = metadata.get('loras', [])
            checkpoint = metadata.get('checkpoint')
            
            if not civitai_resources and not checkpoint:
                return {
                    "error": "No LoRA information found in this image",
                    "loras": []
                }
            
            # Process LoRAs and collect base models
            base_model_counts = {}
            loras = []
            
            # Process LoRAs
            for resource in civitai_resources:
                # Get model version ID
                model_version_id = resource.get('modelVersionId')
                if not model_version_id:
                    continue
                
                # Initialize lora entry with default values
                lora_entry = {
                    'id': model_version_id,
                    'name': resource.get('modelName', ''),
                    'version': resource.get('modelVersionName', ''),
                    'type': resource.get('type', 'lora'),
                    'weight': resource.get('weight', 1.0),
                    'existsLocally': False,
                    'localPath': None,
                    'file_name': '',
                    'hash': '',
                    'thumbnailUrl': '',
                    'baseModel': '',
                    'size': 0,
                    'downloadUrl': '',
                    'isDeleted': False
                }
                
                # Get additional info from Civitai if client is available
                if civitai_client:
                    civitai_info = await civitai_client.get_model_version_info(model_version_id)

                    # Check if this LoRA exists locally by SHA256 hash
                    if civitai_info and civitai_info.get("error") != "Model not found":
                        # LoRA exists on Civitai, process its information
                        if 'files' in civitai_info:
                            # Find the model file (type="Model") in the files list
                            model_file = next((file for file in civitai_info.get('files', []) 
                                            if file.get('type') == 'Model'), None)
                            
                            if model_file and recipe_scanner:
                                sha256 = model_file.get('hashes', {}).get('SHA256', '')
                                if sha256:
                                    lora_scanner = recipe_scanner._lora_scanner
                                    exists_locally = lora_scanner.has_lora_hash(sha256)
                                    if exists_locally:
                                        local_path = lora_scanner.get_lora_path_by_hash(sha256)
                                        lora_entry['existsLocally'] = True
                                        lora_entry['localPath'] = local_path
                                        lora_entry['file_name'] = os.path.splitext(os.path.basename(local_path))[0]
                                    else:
                                        # For missing LoRAs, get file_name from model_file.name
                                        file_name = model_file.get('name', '')
                                        lora_entry['file_name'] = os.path.splitext(file_name)[0] if file_name else ''
                                
                                lora_entry['hash'] = sha256
                                lora_entry['size'] = model_file.get('sizeKB', 0) * 1024
                        
                        # Get thumbnail URL from first image
                        if 'images' in civitai_info and civitai_info['images']:
                            lora_entry['thumbnailUrl'] = civitai_info['images'][0].get('url', '')
                        
                        # Get base model and update counts
                        current_base_model = civitai_info.get('baseModel', '')
                        lora_entry['baseModel'] = current_base_model
                        if current_base_model:
                            base_model_counts[current_base_model] = base_model_counts.get(current_base_model, 0) + 1
                        
                        # Get download URL
                        lora_entry['downloadUrl'] = civitai_info.get('downloadUrl', '')
                    else:
                        # LoRA is deleted from Civitai or not found
                        lora_entry['isDeleted'] = True
                        lora_entry['thumbnailUrl'] = '/loras_static/images/no-preview.png'
                
                loras.append(lora_entry)
            
            # Set base_model to the most common one from civitai_info
            base_model = None
            if base_model_counts:
                base_model = max(base_model_counts.items(), key=lambda x: x[1])[0]
            
            # Extract generation parameters for recipe metadata
            gen_params = {}
            for key in GEN_PARAM_KEYS:
                if key in metadata:
                    gen_params[key] = metadata.get(key, '')
            
            return {
                'base_model': base_model,
                'loras': loras,
                'gen_params': gen_params,
                'raw_metadata': metadata
            }
            
        except Exception as e:
            logger.error(f"Error parsing standard metadata: {e}", exc_info=True)
            return {"error": str(e), "loras": []}
        
    def _parse_recipe_metadata(self, user_comment: str) -> Dict[str, Any]:
        """Parse recipe metadata from UserComment"""
        try:
            # Split by 'Negative prompt:' to get the prompt
            parts = user_comment.split('Negative prompt:', 1)
            prompt = parts[0].strip()
            
            # Initialize metadata with prompt
            metadata = {"prompt": prompt, "loras": [], "checkpoint": None}
            
            # Extract additional fields if available
            if len(parts) > 1:
                negative_and_params = parts[1]
                
                # Extract negative prompt
                if "Steps:" in negative_and_params:
                    neg_prompt = negative_and_params.split("Steps:", 1)[0].strip()
                    metadata["negative_prompt"] = neg_prompt
                
                # Extract key-value parameters (Steps, Sampler, CFG scale, etc.)
                param_pattern = r'([A-Za-z ]+): ([^,]+)'
                params = re.findall(param_pattern, negative_and_params)
                for key, value in params:
                    clean_key = key.strip().lower().replace(' ', '_')
                    metadata[clean_key] = value.strip()
            
            # Extract Civitai resources
            if 'Civitai resources:' in user_comment:
                resources_part = user_comment.split('Civitai resources:', 1)[1]
                if '],' in resources_part:
                    resources_json = resources_part.split('],', 1)[0] + ']'
                    try:
                        resources = json.loads(resources_json)
                        # Filter loras and checkpoints
                        for resource in resources:
                            if resource.get('type') == 'lora':
                                # 确保 weight 字段被正确保留
                                lora_entry = resource.copy()
                                # 如果找不到 weight，默认为 1.0
                                if 'weight' not in lora_entry:
                                    lora_entry['weight'] = 1.0
                                # Ensure modelVersionName is included
                                if 'modelVersionName' not in lora_entry:
                                    lora_entry['modelVersionName'] = ''
                                metadata['loras'].append(lora_entry)
                            elif resource.get('type') == 'checkpoint':
                                metadata['checkpoint'] = resource
                    except json.JSONDecodeError:
                        pass
            
            return metadata
        except Exception as e:
            logger.error(f"Error parsing recipe metadata: {e}")
            return {"prompt": user_comment, "loras": [], "checkpoint": None}


class A1111MetadataParser(RecipeMetadataParser):
    """Parser for images with A1111 metadata format (Lora hashes)"""
    
    METADATA_MARKER = r'Lora hashes:'
    LORA_PATTERN = r'<lora:([^:]+):([^>]+)>'
    LORA_HASH_PATTERN = r'([^:]+): ([a-f0-9]+)'
    
    def is_metadata_matching(self, user_comment: str) -> bool:
        """Check if the user comment matches the A1111 metadata format"""
        return 'Lora hashes:' in user_comment
    
    async def parse_metadata(self, user_comment: str, recipe_scanner=None, civitai_client=None) -> Dict[str, Any]:
        """Parse metadata from images with A1111 metadata format"""
        try:
            # Extract prompt and negative prompt
            parts = user_comment.split('Negative prompt:', 1)
            prompt = parts[0].strip()
            
            # Initialize metadata
            metadata = {"prompt": prompt, "loras": []}
            
            # Extract negative prompt and parameters
            if len(parts) > 1:
                negative_and_params = parts[1]
                
                # Extract negative prompt
                if "Steps:" in negative_and_params:
                    neg_prompt = negative_and_params.split("Steps:", 1)[0].strip()
                    metadata["negative_prompt"] = neg_prompt
                
                # Extract key-value parameters (Steps, Sampler, CFG scale, etc.)
                param_pattern = r'([A-Za-z ]+): ([^,]+)'
                params = re.findall(param_pattern, negative_and_params)
                for key, value in params:
                    clean_key = key.strip().lower().replace(' ', '_')
                    metadata[clean_key] = value.strip()
            
            # Extract LoRA information from prompt
            lora_weights = {}
            lora_matches = re.findall(self.LORA_PATTERN, prompt)
            for lora_name, weight in lora_matches:
                lora_weights[lora_name.strip()] = float(weight.strip())
            
            # Remove LoRA patterns from prompt
            metadata["prompt"] = re.sub(self.LORA_PATTERN, '', prompt).strip()
            
            # Extract LoRA hashes
            lora_hashes = {}
            if 'Lora hashes:' in user_comment:
                lora_hash_section = user_comment.split('Lora hashes:', 1)[1].strip()
                if lora_hash_section.startswith('"'):
                    lora_hash_section = lora_hash_section[1:].split('"', 1)[0]
                hash_matches = re.findall(self.LORA_HASH_PATTERN, lora_hash_section)
                for lora_name, hash_value in hash_matches:
                    # Remove any leading comma and space from lora name
                    clean_name = lora_name.strip().lstrip(',').strip()
                    lora_hashes[clean_name] = hash_value.strip()
            
            # Process LoRAs and collect base models
            base_model_counts = {}
            loras = []
            
            # Process each LoRA with hash and weight
            for lora_name, hash_value in lora_hashes.items():
                weight = lora_weights.get(lora_name, 1.0)
                
                # Initialize lora entry with default values
                lora_entry = {
                    'name': lora_name,
                    'type': 'lora',
                    'weight': weight,
                    'existsLocally': False,
                    'localPath': None,
                    'file_name': lora_name,
                    'hash': hash_value,
                    'thumbnailUrl': '/loras_static/images/no-preview.png',
                    'baseModel': '',
                    'size': 0,
                    'downloadUrl': '',
                    'isDeleted': False
                }
                
                # Get info from Civitai by hash
                if civitai_client:
                    try:
                        civitai_info = await civitai_client.get_model_by_hash(hash_value)
                        if civitai_info and civitai_info.get("error") != "Model not found":
                            # Get model version ID
                            lora_entry['id'] = civitai_info.get('id', '')
                            
                            # Get model name and version
                            lora_entry['name'] = civitai_info.get('model', {}).get('name', lora_name)
                            lora_entry['version'] = civitai_info.get('name', '')
                            
                            # Get thumbnail URL
                            if 'images' in civitai_info and civitai_info['images']:
                                lora_entry['thumbnailUrl'] = civitai_info['images'][0].get('url', '')
                            
                            # Get base model and update counts
                            current_base_model = civitai_info.get('baseModel', '')
                            lora_entry['baseModel'] = current_base_model
                            if current_base_model:
                                base_model_counts[current_base_model] = base_model_counts.get(current_base_model, 0) + 1
                            
                            # Get download URL
                            lora_entry['downloadUrl'] = civitai_info.get('downloadUrl', '')
                            
                            # Get file name and size from Civitai
                            if 'files' in civitai_info:
                                model_file = next((file for file in civitai_info.get('files', []) 
                                                if file.get('type') == 'Model'), None)
                                if model_file:
                                    file_name = model_file.get('name', '')
                                    lora_entry['file_name'] = os.path.splitext(file_name)[0] if file_name else lora_name
                                    lora_entry['size'] = model_file.get('sizeKB', 0) * 1024
                                    # Update hash to sha256
                                    lora_entry['hash'] = model_file.get('hashes', {}).get('SHA256', hash_value).lower()
                                    
                            # Check if exists locally with sha256 hash
                            if recipe_scanner and lora_entry['hash']:
                                lora_scanner = recipe_scanner._lora_scanner
                                exists_locally = lora_scanner.has_lora_hash(lora_entry['hash'])
                                if exists_locally:
                                    lora_cache = await lora_scanner.get_cached_data()
                                    lora_item = next((item for item in lora_cache.raw_data if item['sha256'] == lora_entry['hash']), None)
                                    if lora_item:
                                        lora_entry['existsLocally'] = True
                                        lora_entry['localPath'] = lora_item['file_path']
                                        lora_entry['thumbnailUrl'] = config.get_preview_static_url(lora_item['preview_url'])
                                        
                    except Exception as e:
                        logger.error(f"Error fetching Civitai info for LoRA hash {hash_value}: {e}")
                
                loras.append(lora_entry)

            # Set base_model to the most common one from civitai_info
            base_model = None
            if base_model_counts:
                base_model = max(base_model_counts.items(), key=lambda x: x[1])[0]
            
            # Extract generation parameters for recipe metadata
            gen_params = {}
            for key in GEN_PARAM_KEYS:
                if key in metadata:
                    gen_params[key] = metadata.get(key, '')
            
            # Add model information if available
            if 'model' in metadata:
                gen_params['checkpoint'] = metadata['model']
            
            return {
                'base_model': base_model,
                'loras': loras,
                'gen_params': gen_params,
                'raw_metadata': metadata
            }
            
        except Exception as e:
            logger.error(f"Error parsing A1111 metadata: {e}", exc_info=True)
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
        if RecipeFormatParser().is_metadata_matching(user_comment):
            logger.info("RecipeFormatParser") 
            return RecipeFormatParser()
        elif StandardMetadataParser().is_metadata_matching(user_comment):
            logger.info("StandardMetadataParser")
            return StandardMetadataParser()
        elif A1111MetadataParser().is_metadata_matching(user_comment):
            logger.info("A1111MetadataParser")
            return A1111MetadataParser()
        else:
            logger.info("No parser found for this image")
            return None