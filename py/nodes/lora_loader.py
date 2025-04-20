import logging
from nodes import LoraLoader
from comfy.comfy_types import IO # type: ignore
from ..services.lora_scanner import LoraScanner
from ..config import config
import asyncio
import os
from .utils import FlexibleOptionalInputType, any_type, get_lora_info, extract_lora_name, get_loras_list

logger = logging.getLogger(__name__)

class LoraManagerLoader:
    NAME = "Lora Loader (LoraManager)"
    CATEGORY = "Lora Manager/loaders"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                # "clip": ("CLIP",),
                "text": (IO.STRING, {
                    "multiline": True, 
                    "dynamicPrompts": True, 
                    "tooltip": "Format: <lora:lora_name:strength> separated by spaces or punctuation",
                    "placeholder": "LoRA syntax input: <lora:name:strength>"
                }),
            },
            "optional": FlexibleOptionalInputType(any_type),
        }

    RETURN_TYPES = ("MODEL", "CLIP", IO.STRING, IO.STRING)
    RETURN_NAMES = ("MODEL", "CLIP", "trigger_words", "loaded_loras")
    FUNCTION = "load_loras"
    
    def load_loras(self, model, text, **kwargs):
        """Loads multiple LoRAs based on the kwargs input and lora_stack."""
        loaded_loras = []
        all_trigger_words = []
        
        clip = kwargs.get('clip', None)
        lora_stack = kwargs.get('lora_stack', None)
        # First process lora_stack if available
        if lora_stack:
            for lora_path, model_strength, clip_strength in lora_stack:
                # Apply the LoRA using the provided path and strengths
                model, clip = LoraLoader().load_lora(model, clip, lora_path, model_strength, clip_strength)
                
                # Extract lora name for trigger words lookup
                lora_name = extract_lora_name(lora_path)
                _, trigger_words = asyncio.run(get_lora_info(lora_name))
                
                all_trigger_words.extend(trigger_words)
                loaded_loras.append(f"{lora_name}: {model_strength}")
        
        # Then process loras from kwargs with support for both old and new formats
        loras_list = get_loras_list(kwargs)
        for lora in loras_list:
            if not lora.get('active', False):
                continue
                
            lora_name = lora['name']
            strength = float(lora['strength'])
            
            # Get lora path and trigger words
            lora_path, trigger_words = asyncio.run(get_lora_info(lora_name))
            
            # Apply the LoRA using the resolved path
            model, clip = LoraLoader().load_lora(model, clip, lora_path, strength, strength)
            loaded_loras.append(f"{lora_name}: {strength}")
            
            # Add trigger words to collection
            all_trigger_words.extend(trigger_words)
        
        # use ',, ' to separate trigger words for group mode
        trigger_words_text = ",, ".join(all_trigger_words) if all_trigger_words else ""
        
        # Format loaded_loras as <lora:lora_name:strength> separated by spaces
        formatted_loras = " ".join([f"<lora:{name.split(':')[0].strip()}:{str(strength).strip()}>" 
                                  for name, strength in [item.split(':') for item in loaded_loras]])

        return (model, clip, trigger_words_text, formatted_loras)