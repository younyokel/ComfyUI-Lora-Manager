from nodes import LoraLoader
from comfy.comfy_types import IO # type: ignore
from ..services.lora_scanner import LoraScanner
from ..config import config
import asyncio
import os
from .utils import FlexibleOptionalInputType, any_type

class LoraManagerLoader:
    NAME = "Lora Loader (LoraManager)"
    CATEGORY = "Lora Manager/loaders"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "text": (IO.STRING, {
                    "multiline": True, 
                    "dynamicPrompts": True, 
                    "tooltip": "Format: <lora:lora_name:strength> separated by spaces or punctuation",
                    "placeholder": "LoRA syntax input: <lora:name:strength>"
                }),
            },
            "optional": FlexibleOptionalInputType(any_type),
        }

    RETURN_TYPES = ("MODEL", "CLIP", IO.STRING)
    RETURN_NAMES = ("MODEL", "CLIP", "trigger_words")
    FUNCTION = "load_loras"

    async def get_lora_info(self, lora_name):
        """Get the lora path and trigger words from cache"""
        scanner = await LoraScanner.get_instance()
        cache = await scanner.get_cached_data()
        
        for item in cache.raw_data:
            if item.get('file_name') == lora_name:
                file_path = item.get('file_path')
                if file_path:
                    for root in config.loras_roots:
                        root = root.replace(os.sep, '/')
                        if file_path.startswith(root):
                            relative_path = os.path.relpath(file_path, root).replace(os.sep, '/')
                            # Get trigger words from civitai metadata
                            civitai = item.get('civitai', {})
                            trigger_words = civitai.get('trainedWords', []) if civitai else []
                            return relative_path, trigger_words
        return lora_name, []  # Fallback if not found

    def extract_lora_name(self, lora_path):
        """Extract the lora name from a lora path (e.g., 'IL\\aorunIllstrious.safetensors' -> 'aorunIllstrious')"""
        # Get the basename without extension
        basename = os.path.basename(lora_path)
        return os.path.splitext(basename)[0]
    
    def load_loras(self, model, clip, text, **kwargs):
        """Loads multiple LoRAs based on the kwargs input and lora_stack."""
        loaded_loras = []
        all_trigger_words = []
        
        lora_stack = kwargs.get('lora_stack', None)
        # First process lora_stack if available
        if lora_stack:
            for lora_path, model_strength, clip_strength in lora_stack:
                # Apply the LoRA using the provided path and strengths
                model, clip = LoraLoader().load_lora(model, clip, lora_path, model_strength, clip_strength)
                
                # Extract lora name for trigger words lookup
                lora_name = self.extract_lora_name(lora_path)
                _, trigger_words = asyncio.run(self.get_lora_info(lora_name))
                
                all_trigger_words.extend(trigger_words)
                loaded_loras.append(f"{lora_name}: {model_strength}")
        
        # Then process loras from kwargs
        if 'loras' in kwargs:
            for lora in kwargs['loras']:
                if not lora.get('active', False):
                    continue
                    
                lora_name = lora['name']
                strength = float(lora['strength'])
                
                # Get lora path and trigger words
                lora_path, trigger_words = asyncio.run(self.get_lora_info(lora_name))
                
                # Apply the LoRA using the resolved path
                model, clip = LoraLoader().load_lora(model, clip, lora_path, strength, strength)
                loaded_loras.append(f"{lora_name}: {strength}")
                
                # Add trigger words to collection
                all_trigger_words.extend(trigger_words)
        
        # use ',, ' to separate trigger words for group mode
        trigger_words_text = ",, ".join(all_trigger_words) if all_trigger_words else ""

        return (model, clip, trigger_words_text)