import piexif
import json
import logging
from typing import Dict, Optional, Any
from io import BytesIO
import os
from PIL import Image
import re

logger = logging.getLogger(__name__)

class ExifUtils:
    """Utility functions for working with EXIF data in images"""
    
    @staticmethod
    def extract_user_comment(image_path: str) -> Optional[str]:
        """Extract UserComment field from image EXIF data"""
        try:
            # First try to open as image to check format
            with Image.open(image_path) as img:
                if img.format not in ['JPEG', 'TIFF', 'WEBP']:
                    # For non-JPEG/TIFF/WEBP images, try to get EXIF through PIL
                    exif = img._getexif()
                    if exif and piexif.ExifIFD.UserComment in exif:
                        user_comment = exif[piexif.ExifIFD.UserComment]
                        if isinstance(user_comment, bytes):
                            if user_comment.startswith(b'UNICODE\0'):
                                return user_comment[8:].decode('utf-16be')
                            return user_comment.decode('utf-8', errors='ignore')
                        return user_comment
                    return None
                
                # For JPEG/TIFF/WEBP, use piexif
                exif_dict = piexif.load(image_path)
                
                if piexif.ExifIFD.UserComment in exif_dict.get('Exif', {}):
                    user_comment = exif_dict['Exif'][piexif.ExifIFD.UserComment]
                    if isinstance(user_comment, bytes):
                        if user_comment.startswith(b'UNICODE\0'):
                            user_comment = user_comment[8:].decode('utf-16be')
                        else:
                            user_comment = user_comment.decode('utf-8', errors='ignore')
                    return user_comment
                return None
                
        except Exception as e:
            logger.error(f"Error extracting EXIF data from {image_path}: {e}")
            return None
    
    @staticmethod
    def update_user_comment(image_path: str, user_comment: str) -> str:
        """Update UserComment field in image EXIF data"""
        try:
            # Load the image and its EXIF data
            with Image.open(image_path) as img:
                # Get original format
                img_format = img.format
                
                # For WebP format, we need a different approach
                if img_format == 'WEBP':
                    # WebP doesn't support standard EXIF through piexif
                    # We'll use PIL's exif parameter directly
                    exif_dict = {'Exif': {piexif.ExifIFD.UserComment: b'UNICODE\0' + user_comment.encode('utf-16be')}}
                    exif_bytes = piexif.dump(exif_dict)
                    
                    # Save with the exif data
                    img.save(image_path, format='WEBP', exif=exif_bytes, quality=85)
                    return image_path
                
                # For other formats, use the standard approach
                try:
                    exif_dict = piexif.load(img.info.get('exif', b''))
                except:
                    exif_dict = {'0th':{}, 'Exif':{}, 'GPS':{}, 'Interop':{}, '1st':{}}
                
                # If no Exif dictionary exists, create one
                if 'Exif' not in exif_dict:
                    exif_dict['Exif'] = {}
                
                # Update the UserComment field - use UNICODE format
                unicode_bytes = user_comment.encode('utf-16be')
                user_comment_bytes = b'UNICODE\0' + unicode_bytes
                
                exif_dict['Exif'][piexif.ExifIFD.UserComment] = user_comment_bytes
                
                # Convert EXIF dict back to bytes
                exif_bytes = piexif.dump(exif_dict)
                
                # Save the image with updated EXIF data
                img.save(image_path, exif=exif_bytes)
                
            return image_path
        except Exception as e:
            logger.error(f"Error updating EXIF data in {image_path}: {e}")
            return image_path
            
    @staticmethod
    def append_recipe_metadata(image_path, recipe_data) -> str:
        """Append recipe metadata to an image's EXIF data"""
        try:
            # First, extract existing user comment
            user_comment = ExifUtils.extract_user_comment(image_path)
            
            # Check if there's already recipe metadata in the user comment
            if user_comment:
                # Remove any existing recipe metadata
                user_comment = ExifUtils.remove_recipe_metadata(user_comment)
            
            # Prepare simplified loras data
            simplified_loras = []
            for lora in recipe_data.get("loras", []):
                simplified_lora = {
                    "file_name": lora.get("file_name", ""),
                    "hash": lora.get("hash", "").lower() if lora.get("hash") else "",
                    "strength": float(lora.get("strength", 1.0)),
                    "modelVersionId": lora.get("modelVersionId", ""),
                    "modelName": lora.get("modelName", ""),
                    "modelVersionName": lora.get("modelVersionName", ""),
                }
                simplified_loras.append(simplified_lora)            
            
            # Create recipe metadata JSON
            recipe_metadata = {
                'title': recipe_data.get('title', ''),
                'base_model': recipe_data.get('base_model', ''),
                'loras': simplified_loras,
                'gen_params': recipe_data.get('gen_params', {}),
                'tags': recipe_data.get('tags', [])
            }
            
            # Convert to JSON string
            recipe_metadata_json = json.dumps(recipe_metadata)
            
            # Create the recipe metadata marker
            recipe_metadata_marker = f"Recipe metadata: {recipe_metadata_json}"
            
            # Append to existing user comment or create new one
            new_user_comment = f"{user_comment} \n {recipe_metadata_marker}" if user_comment else recipe_metadata_marker
            
            # Write back to the image
            return ExifUtils.update_user_comment(image_path, new_user_comment)
        except Exception as e:
            logger.error(f"Error appending recipe metadata: {e}", exc_info=True)
            return image_path

    @staticmethod
    def remove_recipe_metadata(user_comment):
        """Remove recipe metadata from user comment"""
        if not user_comment:
            return ""
        
        # Find the recipe metadata marker
        recipe_marker_index = user_comment.find("Recipe metadata: ")
        if recipe_marker_index == -1:
            return user_comment
        
        # If recipe metadata is not at the start, remove the preceding ", "
        if recipe_marker_index >= 2 and user_comment[recipe_marker_index-2:recipe_marker_index] == ", ":
            recipe_marker_index -= 2
        
        # Remove the recipe metadata part
        # First, find where the metadata ends (next line or end of string)
        next_line_index = user_comment.find("\n", recipe_marker_index)
        if next_line_index == -1:
            # Metadata is at the end of the string
            return user_comment[:recipe_marker_index].rstrip()
        else:
            # Metadata is in the middle of the string
            return user_comment[:recipe_marker_index] + user_comment[next_line_index:]
            
    @staticmethod
    def optimize_image(image_data, target_width=250, format='webp', quality=85, preserve_metadata=True):
        """
        Optimize an image by resizing and converting to WebP format
        
        Args:
            image_data: Binary image data or path to image file
            target_width: Width to resize the image to (preserves aspect ratio)
            format: Output format (default: webp)
            quality: Output quality (0-100)
            preserve_metadata: Whether to preserve EXIF metadata
            
        Returns:
            Tuple of (optimized_image_data, extension)
        """
        try:
            # Extract metadata if needed
            user_comment = None
            if preserve_metadata:
                if isinstance(image_data, str) and os.path.exists(image_data):
                    # It's a file path
                    user_comment = ExifUtils.extract_user_comment(image_data)
                    img = Image.open(image_data)
                else:
                    # It's binary data
                    temp_img = BytesIO(image_data)
                    img = Image.open(temp_img)
                    # Save to a temporary file to extract metadata
                    import tempfile
                    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp_file:
                        temp_path = temp_file.name
                        temp_file.write(image_data)
                    user_comment = ExifUtils.extract_user_comment(temp_path)
                    os.unlink(temp_path)
            else:
                # Just open the image without extracting metadata
                if isinstance(image_data, str) and os.path.exists(image_data):
                    img = Image.open(image_data)
                else:
                    img = Image.open(BytesIO(image_data))
            
            # Calculate new height to maintain aspect ratio
            width, height = img.size
            new_height = int(height * (target_width / width))
            
            # Resize the image
            resized_img = img.resize((target_width, new_height), Image.LANCZOS)
            
            # Save to BytesIO in the specified format
            output = BytesIO()
            
            # WebP format
            if format.lower() == 'webp':
                resized_img.save(output, format='WEBP', quality=quality)
                extension = '.webp'
            # JPEG format
            elif format.lower() in ('jpg', 'jpeg'):
                resized_img.save(output, format='JPEG', quality=quality)
                extension = '.jpg'
            # PNG format
            elif format.lower() == 'png':
                resized_img.save(output, format='PNG', optimize=True)
                extension = '.png'
            else:
                # Default to WebP
                resized_img.save(output, format='WEBP', quality=quality)
                extension = '.webp'
            
            # Get the optimized image data
            optimized_data = output.getvalue()
            
            # If we need to preserve metadata, write it to a temporary file
            if preserve_metadata and user_comment:
                # For WebP format, we'll directly save with metadata
                if format.lower() == 'webp':
                    # Create a new BytesIO with metadata
                    output_with_metadata = BytesIO()
                    
                    # Create EXIF data with user comment
                    exif_dict = {'Exif': {piexif.ExifIFD.UserComment: b'UNICODE\0' + user_comment.encode('utf-16be')}}
                    exif_bytes = piexif.dump(exif_dict)
                    
                    # Save with metadata
                    resized_img.save(output_with_metadata, format='WEBP', exif=exif_bytes, quality=quality)
                    optimized_data = output_with_metadata.getvalue()
                else:
                    # For other formats, use the temporary file approach
                    import tempfile
                    with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as temp_file:
                        temp_path = temp_file.name
                        temp_file.write(optimized_data)
                    
                    # Add the metadata back
                    ExifUtils.update_user_comment(temp_path, user_comment)
                    
                    # Read the file with metadata
                    with open(temp_path, 'rb') as f:
                        optimized_data = f.read()
                    
                    # Clean up
                    os.unlink(temp_path)
            
            return optimized_data, extension
            
        except Exception as e:
            logger.error(f"Error optimizing image: {e}", exc_info=True)
            # Return original data if optimization fails
            if isinstance(image_data, str) and os.path.exists(image_data):
                with open(image_data, 'rb') as f:
                    return f.read(), os.path.splitext(image_data)[1]
            return image_data, '.jpg'

    @staticmethod
    def _parse_comfyui_workflow(workflow_data: Any) -> Dict[str, Any]:
        """
        Parse ComfyUI workflow data and extract relevant generation parameters
        
        Args:
            workflow_data: Raw workflow data (string or dict)
            
        Returns:
            Formatted generation parameters dictionary
        """
        try:
            # If workflow_data is a string, try to parse it as JSON
            if isinstance(workflow_data, str):
                try:
                    workflow_data = json.loads(workflow_data)
                except json.JSONDecodeError:
                    logger.error("Failed to parse workflow data as JSON")
                    return {}
            
            # Now workflow_data should be a dictionary
            if not isinstance(workflow_data, dict):
                logger.error(f"Workflow data is not a dictionary: {type(workflow_data)}")
                return {}
                
            # Initialize parameters dictionary with only the required fields
            gen_params = {
                "prompt": "",
                "negative_prompt": "",
                "steps": "",
                "sampler": "",
                "cfg_scale": "",
                "seed": "",
                "size": "",
                "clip_skip": ""
            }
            
            # Process each node in the workflow to extract parameters
            for node_id, node_data in workflow_data.items():
                if not isinstance(node_data, dict):
                    continue
                    
                # Extract node inputs if available
                inputs = node_data.get("inputs", {})
                if not inputs:
                    continue
                
                # KSampler nodes contain most generation parameters
                if "KSampler" in node_data.get("class_type", ""):
                    # Extract basic sampling parameters
                    gen_params["steps"] = inputs.get("steps", "")
                    gen_params["cfg_scale"] = inputs.get("cfg", "")
                    gen_params["sampler"] = inputs.get("sampler_name", "")
                    gen_params["seed"] = inputs.get("seed", "")
                    if isinstance(gen_params["seed"], list) and len(gen_params["seed"]) > 1:
                        gen_params["seed"] = gen_params["seed"][1]  # Use the actual value if it's a list
                
                # CLIP Text Encode nodes contain prompts
                elif "CLIPTextEncode" in node_data.get("class_type", ""):
                    # Check for negative prompt nodes
                    title = node_data.get("_meta", {}).get("title", "").lower()
                    prompt_text = inputs.get("text", "")
                    
                    if "negative" in title:
                        gen_params["negative_prompt"] = prompt_text
                    elif prompt_text and not "negative" in title and gen_params["prompt"] == "":
                        gen_params["prompt"] = prompt_text
                
                # CLIPSetLastLayer contains clip_skip information
                elif "CLIPSetLastLayer" in node_data.get("class_type", ""):
                    gen_params["clip_skip"] = inputs.get("stop_at_clip_layer", "")
                    if isinstance(gen_params["clip_skip"], int) and gen_params["clip_skip"] < 0:
                        # Convert negative layer index to positive clip skip value
                        gen_params["clip_skip"] = abs(gen_params["clip_skip"])
                
                # Look for resolution information
                elif "LatentImage" in node_data.get("class_type", "") or "Empty" in node_data.get("class_type", ""):
                    width = inputs.get("width", 0)
                    height = inputs.get("height", 0)
                    if width and height:
                        gen_params["size"] = f"{width}x{height}"
                    
                    # Some nodes have resolution as a string like "832x1216 (0.68)"
                    resolution = inputs.get("resolution", "")
                    if isinstance(resolution, str) and "x" in resolution:
                        gen_params["size"] = resolution.split(" ")[0]  # Extract just the dimensions
            
            return gen_params
            
        except Exception as e:
            logger.error(f"Error parsing ComfyUI workflow: {e}", exc_info=True)
            return {}

    @staticmethod
    def extract_comfyui_gen_params(image_path: str) -> Dict[str, Any]:
        """
        Extract ComfyUI workflow data from PNG images and format for recipe data
        Only extracts the specific generation parameters needed for recipes.
        
        Args:
            image_path: Path to the ComfyUI-generated PNG image
            
        Returns:
            Dictionary containing formatted generation parameters
        """
        try:
            # Check if the file exists and is accessible
            if not os.path.exists(image_path):
                logger.error(f"Image file not found: {image_path}")
                return {}
                
            # Open the image to extract embedded workflow data
            with Image.open(image_path) as img:
                workflow_data = None
                
                # For PNG images, look for the ComfyUI workflow data in PNG chunks
                if img.format == 'PNG':
                    # Check standard metadata fields that might contain workflow
                    if 'parameters' in img.info:
                        workflow_data = img.info['parameters']
                    elif 'prompt' in img.info:
                        workflow_data = img.info['prompt']
                    else:
                        # Look for other potential field names that might contain workflow data
                        for key in img.info:
                            if isinstance(key, str) and ('workflow' in key.lower() or 'comfy' in key.lower()):
                                workflow_data = img.info[key]
                                break
                
                # If no workflow data found in PNG chunks, try EXIF as fallback
                if not workflow_data:
                    user_comment = ExifUtils.extract_user_comment(image_path)
                    if user_comment and '{' in user_comment and '}' in user_comment:
                        # Try to extract JSON part
                        json_start = user_comment.find('{')
                        json_end = user_comment.rfind('}') + 1
                        workflow_data = user_comment[json_start:json_end]
                
                # Parse workflow data if found
                if workflow_data:
                    return ExifUtils._parse_comfyui_workflow(workflow_data)
                
                return {}
                
        except Exception as e:
            logger.error(f"Error extracting ComfyUI gen params from {image_path}: {e}", exc_info=True)
            return {}