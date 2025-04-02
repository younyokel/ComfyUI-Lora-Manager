import json
import os
import asyncio
import re
import numpy as np
import time
from server import PromptServer # type: ignore
import folder_paths # type: ignore
from ..services.lora_scanner import LoraScanner
from ..config import config
from ..workflow.parser import WorkflowParser
from PIL import Image, PngImagePlugin
import piexif
from io import BytesIO

class SaveImage:
    NAME = "Save Image (LoraManager)"
    CATEGORY = "Lora Manager/utils"
    DESCRIPTION = "Save images with embedded generation metadata in compatible format"

    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()
        self.type = "output"
        self.prefix_append = ""
        self.compress_level = 4
        self.counter = 0
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "filename_prefix": ("STRING", {"default": "ComfyUI"}),
                "file_format": (["png", "jpeg", "webp"],),
            },
            "optional": {
                "lossless_webp": ("BOOLEAN", {"default": True}),
                "quality": ("INT", {"default": 100, "min": 1, "max": 100}),
                "save_workflow_json": ("BOOLEAN", {"default": False}),
                "add_counter_to_filename": ("BOOLEAN", {"default": True}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("image", "filename")
    FUNCTION = "process_image"
    OUTPUT_NODE = True

    async def get_lora_hash(self, lora_name):
        """Get the lora hash from cache"""
        scanner = await LoraScanner.get_instance()
        cache = await scanner.get_cached_data()
        
        for item in cache.raw_data:
            if item.get('file_name') == lora_name:
                return item.get('sha256')
        return None

    async def format_metadata(self, parsed_workflow):
        """Format metadata in the requested format similar to userComment example"""
        if not parsed_workflow:
            return ""
        
        # Extract the prompt and negative prompt
        prompt = parsed_workflow.get('prompt', '')
        negative_prompt = parsed_workflow.get('negative_prompt', '')
        
        # Extract loras from the prompt if present
        loras_text = parsed_workflow.get('loras', '')
        lora_hashes = {}
        
        # If loras are found, add them on a new line after the prompt
        if loras_text:
            prompt_with_loras = f"{prompt}\n{loras_text}"
            
            # Extract lora names from the format <lora:name:strength>
            lora_matches = re.findall(r'<lora:([^:]+):([^>]+)>', loras_text)
            
            # Get hash for each lora
            for lora_name, strength in lora_matches:
                hash_value = await self.get_lora_hash(lora_name)
                if hash_value:
                    lora_hashes[lora_name] = hash_value
        else:
            prompt_with_loras = prompt
        
        # Format the first part (prompt and loras)
        metadata_parts = [prompt_with_loras]
        
        # Add negative prompt
        if negative_prompt:
            metadata_parts.append(f"Negative prompt: {negative_prompt}")
        
        # Format the second part (generation parameters)
        params = []
        
        # Add standard parameters in the correct order
        if 'steps' in parsed_workflow:
            params.append(f"Steps: {parsed_workflow.get('steps')}")
        
        if 'sampler' in parsed_workflow:
            sampler = parsed_workflow.get('sampler')
            # Convert ComfyUI sampler names to user-friendly names
            sampler_mapping = {
                'euler': 'Euler',
                'euler_ancestral': 'Euler a',
                'dpm_2': 'DPM2',
                'dpm_2_ancestral': 'DPM2 a',
                'heun': 'Heun',
                'dpm_fast': 'DPM fast',
                'dpm_adaptive': 'DPM adaptive',
                'lms': 'LMS',
                'dpmpp_2s_ancestral': 'DPM++ 2S a',
                'dpmpp_sde': 'DPM++ SDE',
                'dpmpp_sde_gpu': 'DPM++ SDE',
                'dpmpp_2m': 'DPM++ 2M',
                'dpmpp_2m_sde': 'DPM++ 2M SDE',
                'dpmpp_2m_sde_gpu': 'DPM++ 2M SDE',
                'ddim': 'DDIM'
            }
            sampler_name = sampler_mapping.get(sampler, sampler)
            params.append(f"Sampler: {sampler_name}")
        
        if 'scheduler' in parsed_workflow:
            scheduler = parsed_workflow.get('scheduler')
            scheduler_mapping = {
                'normal': 'Simple',
                'karras': 'Karras',
                'exponential': 'Exponential',
                'sgm_uniform': 'SGM Uniform',
                'sgm_quadratic': 'SGM Quadratic'
            }
            scheduler_name = scheduler_mapping.get(scheduler, scheduler)
            params.append(f"Schedule type: {scheduler_name}")
        
        # CFG scale (cfg in parsed_workflow)
        if 'cfg_scale' in parsed_workflow:
            params.append(f"CFG scale: {parsed_workflow.get('cfg_scale')}")
        elif 'cfg' in parsed_workflow:
            params.append(f"CFG scale: {parsed_workflow.get('cfg')}")
        
        # Seed
        if 'seed' in parsed_workflow:
            params.append(f"Seed: {parsed_workflow.get('seed')}")
        
        # Size
        if 'size' in parsed_workflow:
            params.append(f"Size: {parsed_workflow.get('size')}")
        
        # Model info
        if 'checkpoint' in parsed_workflow:
            # Extract basename without path
            checkpoint = os.path.basename(parsed_workflow.get('checkpoint', ''))
            # Remove extension if present
            checkpoint = os.path.splitext(checkpoint)[0]
            params.append(f"Model: {checkpoint}")
        
        # Add LoRA hashes if available
        if lora_hashes:
            lora_hash_parts = []
            for lora_name, hash_value in lora_hashes.items():
                lora_hash_parts.append(f"{lora_name}: {hash_value}")
            
            if lora_hash_parts:
                params.append(f"Lora hashes: \"{', '.join(lora_hash_parts)}\"")
        
        # Combine all parameters with commas
        metadata_parts.append(", ".join(params))
        
        # Join all parts with a new line
        return "\n".join(metadata_parts)

    def save_images(self, images, filename_prefix, file_format, prompt=None, extra_pnginfo=None, 
                   lossless_webp=True, quality=100, save_workflow_json=False, add_counter_to_filename=True):
        """Save images with metadata"""
        results = []
        
        # Parse the workflow using the WorkflowParser
        parser = WorkflowParser()
        if prompt:
            parsed_workflow = parser.parse_workflow(prompt)
        else:
            parsed_workflow = {}
            
        # Get or create metadata asynchronously
        metadata = asyncio.run(self.format_metadata(parsed_workflow))
        
        # Process each image
        for i, image in enumerate(images):
            # Convert the tensor image to numpy array
            img = 255. * image.cpu().numpy()
            img = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
            
            # Generate filename with counter if needed
            if add_counter_to_filename:
                filename = f"{filename_prefix}_{self.counter:05d}"
                self.counter += 1
            else:
                filename = f"{filename_prefix}"
            
            # Set file extension and prepare saving parameters
            if file_format == "png":
                filename += ".png"
                file_extension = ".png"
                save_kwargs = {"optimize": True, "compress_level": self.compress_level}
                pnginfo = PngImagePlugin.PngInfo()
            elif file_format == "jpeg":
                filename += ".jpg"
                file_extension = ".jpg"
                save_kwargs = {"quality": quality, "optimize": True}
            elif file_format == "webp":
                filename += ".webp" 
                file_extension = ".webp"
                save_kwargs = {"quality": quality, "lossless": lossless_webp}
            
            # Full save path
            file_path = os.path.join(self.output_dir, filename)
            
            # Save the image with metadata
            try:
                if file_format == "png":
                    if metadata:
                        pnginfo.add_text("parameters", metadata)
                    if save_workflow_json and extra_pnginfo is not None:
                        workflow_json = json.dumps(extra_pnginfo)
                        pnginfo.add_text("workflow", workflow_json)
                    save_kwargs["pnginfo"] = pnginfo
                    img.save(file_path, format="PNG", **save_kwargs)
                elif file_format == "jpeg":
                    # For JPEG, use piexif
                    if metadata:
                        try:
                            exif_dict = {'Exif': {piexif.ExifIFD.UserComment: b'UNICODE\0' + metadata.encode('utf-16be')}}
                            exif_bytes = piexif.dump(exif_dict)
                            save_kwargs["exif"] = exif_bytes
                        except Exception as e:
                            print(f"Error adding EXIF data: {e}")
                    img.save(file_path, format="JPEG", **save_kwargs)
                elif file_format == "webp":
                    # For WebP, also use piexif for metadata
                    if metadata:
                        try:
                            exif_dict = {'Exif': {piexif.ExifIFD.UserComment: b'UNICODE\0' + metadata.encode('utf-16be')}}
                            exif_bytes = piexif.dump(exif_dict)
                            save_kwargs["exif"] = exif_bytes
                        except Exception as e:
                            print(f"Error adding EXIF data: {e}")
                    img.save(file_path, format="WEBP", **save_kwargs)
                
                results.append({
                    "filename": filename,
                    "subfolder": "",
                    "type": self.type
                })
                
                # Notify UI about saved image
                PromptServer.instance.send_sync("image", {
                    "filename": filename,
                    "subfolder": "",
                    "type": self.type,
                })
                
            except Exception as e:
                print(f"Error saving image: {e}")
        
        return results

    def process_image(self, image, filename_prefix="ComfyUI", file_format="png", prompt=None, extra_pnginfo=None,
                     lossless_webp=True, quality=100, save_workflow_json=False, add_counter_to_filename=True):
        """Process and save image with metadata"""
        # Make sure the output directory exists
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Convert single image to list for consistent processing
        images = [image[0]] if len(image.shape) == 3 else [img for img in image]
        
        # Save all images
        results = self.save_images(
            images, 
            filename_prefix, 
            file_format, 
            prompt, 
            extra_pnginfo,
            lossless_webp,
            quality,
            save_workflow_json,
            add_counter_to_filename
        )
        
        # Return the first saved filename and the original image
        filename = results[0]["filename"] if results else ""
        return (image, filename)