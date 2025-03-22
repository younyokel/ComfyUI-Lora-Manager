from comfy.comfy_types import IO # type: ignore
from ..services.lora_scanner import LoraScanner
from ..config import config
import asyncio
import os
from .utils import FlexibleOptionalInputType, any_type
import logging

logger = logging.getLogger(__name__)

class LoraStacker:
    NAME = "Lora Stacker (LoraManager)"
    CATEGORY = "Lora Manager/stackers"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": (IO.STRING, {
                    "multiline": True, 
                    "dynamicPrompts": True, 
                    "tooltip": "Format: <lora:lora_name:strength> separated by spaces or punctuation",
                    "placeholder": "LoRA syntax input: <lora:name:strength>"
                }),
            },
            "optional": FlexibleOptionalInputType(any_type),
        }

    RETURN_TYPES = ("LORA_STACK", IO.STRING)
    RETURN_NAMES = ("LORA_STACK", "trigger_words")
    FUNCTION = "stack_loras"

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
    
    def _get_loras_list(self, kwargs):
        """Helper to extract loras list from either old or new kwargs format"""
        if 'loras' not in kwargs:
            return []
            
        loras_data = kwargs['loras']
        # Handle new format: {'loras': {'__value__': [...]}}
        if isinstance(loras_data, dict) and '__value__' in loras_data:
            return loras_data['__value__']
        # Handle old format: {'loras': [...]}
        elif isinstance(loras_data, list):
            return loras_data
        # Unexpected format
        else:
            logger.warning(f"Unexpected loras format: {type(loras_data)}")
            return []
    
    def stack_loras(self, text, **kwargs):
        """Stacks multiple LoRAs based on the kwargs input without loading them."""
        stack = []
        all_trigger_words = []
        
        # Process existing lora_stack if available
        lora_stack = kwargs.get('lora_stack', None)
        if lora_stack:
            stack.extend(lora_stack)
            # Get trigger words from existing stack entries
            for lora_path, _, _ in lora_stack:
                lora_name = self.extract_lora_name(lora_path)
                _, trigger_words = asyncio.run(self.get_lora_info(lora_name))
                all_trigger_words.extend(trigger_words)
        
        # Process loras from kwargs with support for both old and new formats
        loras_list = self._get_loras_list(kwargs)
        for lora in loras_list:
            if not lora.get('active', False):
                continue
                
            lora_name = lora['name']
            model_strength = float(lora['strength'])
            clip_strength = model_strength  # Using same strength for both as in the original loader
            
            # Get lora path and trigger words
            lora_path, trigger_words = asyncio.run(self.get_lora_info(lora_name))
            
            # Add to stack without loading
            # replace '/' with os.sep to avoid different OS path format
            stack.append((lora_path.replace('/', os.sep), model_strength, clip_strength))
            
            # Add trigger words to collection
            all_trigger_words.extend(trigger_words)
        
        # use ',, ' to separate trigger words for group mode
        trigger_words_text = ",, ".join(all_trigger_words) if all_trigger_words else ""

        return (stack, trigger_words_text)
