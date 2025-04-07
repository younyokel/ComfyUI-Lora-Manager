import json
import os
import asyncio
import re
import numpy as np
import folder_paths # type: ignore
from ..services.lora_scanner import LoraScanner
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
    
    # Add pattern format regex for filename substitution
    pattern_format = re.compile(r"(%[^%]+%)")
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "filename_prefix": ("STRING", {"default": "ComfyUI"}),
                "file_format": (["png", "jpeg", "webp"],),
            },
            "optional": {
                "custom_prompt": ("STRING", {"default": "", "forceInput": True}),
                "lossless_webp": ("BOOLEAN", {"default": True}),
                "quality": ("INT", {"default": 100, "min": 1, "max": 100}),
                "embed_workflow": ("BOOLEAN", {"default": False}),
                "add_counter_to_filename": ("BOOLEAN", {"default": True}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
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

    async def format_metadata(self, parsed_workflow, custom_prompt=None):
        """Format metadata in the requested format similar to userComment example"""
        if not parsed_workflow:
            return ""
        
        # Extract the prompt and negative prompt
        prompt = parsed_workflow.get('prompt', '')
        negative_prompt = parsed_workflow.get('negative_prompt', '')
        
        # Override prompt with custom_prompt if provided
        if custom_prompt:
            prompt = custom_prompt
        
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

    # credit to nkchocoai
    # Add format_filename method to handle pattern substitution
    def format_filename(self, filename, parsed_workflow):
        """Format filename with metadata values"""
        if not parsed_workflow:
            return filename
            
        result = re.findall(self.pattern_format, filename)
        for segment in result:
            parts = segment.replace("%", "").split(":")
            key = parts[0]
            
            if key == "seed" and 'seed' in parsed_workflow:
                filename = filename.replace(segment, str(parsed_workflow.get('seed', '')))
            elif key == "width" and 'size' in parsed_workflow:
                size = parsed_workflow.get('size', 'x')
                w = size.split('x')[0] if isinstance(size, str) else size[0]
                filename = filename.replace(segment, str(w))
            elif key == "height" and 'size' in parsed_workflow:
                size = parsed_workflow.get('size', 'x')
                h = size.split('x')[1] if isinstance(size, str) else size[1]
                filename = filename.replace(segment, str(h))
            elif key == "pprompt" and 'prompt' in parsed_workflow:
                prompt = parsed_workflow.get('prompt', '').replace("\n", " ")
                if len(parts) >= 2:
                    length = int(parts[1])
                    prompt = prompt[:length]
                filename = filename.replace(segment, prompt.strip())
            elif key == "nprompt" and 'negative_prompt' in parsed_workflow:
                prompt = parsed_workflow.get('negative_prompt', '').replace("\n", " ")
                if len(parts) >= 2:
                    length = int(parts[1])
                    prompt = prompt[:length]
                filename = filename.replace(segment, prompt.strip())
            elif key == "model" and 'checkpoint' in parsed_workflow:
                model = parsed_workflow.get('checkpoint', '')
                model = os.path.splitext(os.path.basename(model))[0]
                if len(parts) >= 2:
                    length = int(parts[1])
                    model = model[:length]
                filename = filename.replace(segment, model)
            elif key == "date":
                from datetime import datetime
                now = datetime.now()
                date_table = {
                    "yyyy": str(now.year),
                    "MM": str(now.month).zfill(2),
                    "dd": str(now.day).zfill(2),
                    "hh": str(now.hour).zfill(2),
                    "mm": str(now.minute).zfill(2),
                    "ss": str(now.second).zfill(2),
                }
                if len(parts) >= 2:
                    date_format = parts[1]
                    for k, v in date_table.items():
                        date_format = date_format.replace(k, v)
                    filename = filename.replace(segment, date_format)
                else:
                    date_format = "yyyyMMddhhmmss"
                    for k, v in date_table.items():
                        date_format = date_format.replace(k, v)
                    filename = filename.replace(segment, date_format)
                    
        return filename

    def save_images(self, images, filename_prefix, file_format, prompt=None, extra_pnginfo=None, 
                   lossless_webp=True, quality=100, embed_workflow=False, add_counter_to_filename=True,
                   custom_prompt=None):
        """Save images with metadata"""
        results = []
        
        # Parse the workflow using the WorkflowParser
        parser = WorkflowParser()
        if prompt:
            parsed_workflow = parser.parse_workflow(prompt)
        else:
            parsed_workflow = {}
            
        # Get or create metadata asynchronously
        metadata = asyncio.run(self.format_metadata(parsed_workflow, custom_prompt))
        
        # Process filename_prefix with pattern substitution
        filename_prefix = self.format_filename(filename_prefix, parsed_workflow)
        
        # Get initial save path info once for the batch
        full_output_folder, filename, counter, subfolder, processed_prefix = folder_paths.get_save_image_path(
            filename_prefix, self.output_dir, images[0].shape[1], images[0].shape[0]
        )
        
        # Create directory if it doesn't exist
        if not os.path.exists(full_output_folder):
            os.makedirs(full_output_folder, exist_ok=True)
        
        # Process each image with incrementing counter
        for i, image in enumerate(images):
            # Convert the tensor image to numpy array
            img = 255. * image.cpu().numpy()
            img = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
            
            # Generate filename with counter if needed
            base_filename = filename
            if add_counter_to_filename:
                # Use counter + i to ensure unique filenames for all images in batch
                current_counter = counter + i
                base_filename += f"_{current_counter:05}"
                
            # Set file extension and prepare saving parameters
            if file_format == "png":
                file = base_filename + ".png"
                file_extension = ".png"
                save_kwargs = {"optimize": True, "compress_level": self.compress_level}
                pnginfo = PngImagePlugin.PngInfo()
            elif file_format == "jpeg":
                file = base_filename + ".jpg"
                file_extension = ".jpg"
                save_kwargs = {"quality": quality, "optimize": True}
            elif file_format == "webp":
                file = base_filename + ".webp" 
                file_extension = ".webp"
                save_kwargs = {"quality": quality, "lossless": lossless_webp}
            
            # Full save path
            file_path = os.path.join(full_output_folder, file)
            
            # Save the image with metadata
            try:
                if file_format == "png":
                    if metadata:
                        pnginfo.add_text("parameters", metadata)
                    if embed_workflow and extra_pnginfo is not None:
                        workflow_json = json.dumps(extra_pnginfo["workflow"])
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
                    "filename": file,
                    "subfolder": subfolder,
                    "type": self.type
                })
                
            except Exception as e:
                print(f"Error saving image: {e}")
        
        return results

    def process_image(self, images, filename_prefix="ComfyUI", file_format="png", prompt=None, extra_pnginfo=None,
                     lossless_webp=True, quality=100, embed_workflow=False, add_counter_to_filename=True,
                     custom_prompt=""):
        """Process and save image with metadata"""
        # Make sure the output directory exists
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Ensure images is always a list of images
        if len(images.shape) == 3:  # Single image (height, width, channels)
            images = [images]
        else:  # Multiple images (batch, height, width, channels)
            images = [img for img in images]
        
        # Save all images
        results = self.save_images(
            images, 
            filename_prefix, 
            file_format, 
            prompt, 
            extra_pnginfo,
            lossless_webp,
            quality,
            embed_workflow,
            add_counter_to_filename,
            custom_prompt if custom_prompt.strip() else None
        )
        
        return (images,)