import re
from nodes import LoraLoader
from comfy.comfy_types import IO # type: ignore
from ..services.lora_scanner import LoraScanner
from ..config import config
import asyncio
import os

class LoraManagerLoader:
    NAME = "Lora Loader (LoraManager)"
    CATEGORY = "loaders"

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
        }

    RETURN_TYPES = ("MODEL", "CLIP", IO.STRING, IO.STRING)
    RETURN_NAMES = ("MODEL", "CLIP", "loaded_loras", "trigger_words")
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

    def load_loras(self, model, clip, text, **kwargs):
        """Loads multiple LoRAs based on the text input format."""
        for key, value in kwargs.items():
            print(f"{key}: {value}")

        lora_pattern = r'<lora:([^:]+):([\d\.]+)>'
        lora_matches = re.finditer(lora_pattern, text)
        
        loaded_loras = []
        all_trigger_words = []
        
        for match in lora_matches:
            lora_name = match.group(1)
            strength = float(match.group(2))
            
            # Get lora path and trigger words
            lora_path, trigger_words = asyncio.run(self.get_lora_info(lora_name))
            
            # Apply the LoRA using the resolved path
            model, clip = LoraLoader().load_lora(model, clip, lora_path, strength, strength)
            loaded_loras.append(f"{lora_name}: {strength}")
            
            # Add trigger words to collection
            all_trigger_words.extend(trigger_words)
        
        loaded_loras_text = "\n".join(loaded_loras) if loaded_loras else "No LoRAs loaded"
        trigger_words_text = ", ".join(all_trigger_words) if all_trigger_words else ""

        return (model, clip, loaded_loras_text, trigger_words_text)