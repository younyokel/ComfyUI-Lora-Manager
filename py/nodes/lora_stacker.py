from comfy.comfy_types import IO # type: ignore
from ..services.lora_scanner import LoraScanner
from ..config import config
import asyncio
import os
from .utils import FlexibleOptionalInputType, any_type, get_lora_info, extract_lora_name, get_loras_list
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

    RETURN_TYPES = ("LORA_STACK", IO.STRING, IO.STRING)
    RETURN_NAMES = ("LORA_STACK", "trigger_words", "active_loras")
    FUNCTION = "stack_loras"
    
    def stack_loras(self, text, **kwargs):
        """Stacks multiple LoRAs based on the kwargs input without loading them."""
        stack = []
        active_loras = []
        all_trigger_words = []
        
        # Process existing lora_stack if available
        lora_stack = kwargs.get('lora_stack', None)
        if lora_stack:
            stack.extend(lora_stack)
            # Get trigger words from existing stack entries
            for lora_path, _, _ in lora_stack:
                lora_name = extract_lora_name(lora_path)
                _, trigger_words = asyncio.run(get_lora_info(lora_name))
                all_trigger_words.extend(trigger_words)
        
        # Process loras from kwargs with support for both old and new formats
        loras_list = get_loras_list(kwargs)
        for lora in loras_list:
            if not lora.get('active', False):
                continue
                
            lora_name = lora['name']
            model_strength = float(lora['strength'])
            clip_strength = model_strength  # Using same strength for both as in the original loader
            
            # Get lora path and trigger words
            lora_path, trigger_words = asyncio.run(get_lora_info(lora_name))
            
            # Add to stack without loading
            # replace '/' with os.sep to avoid different OS path format
            stack.append((lora_path.replace('/', os.sep), model_strength, clip_strength))
            active_loras.append((lora_name, model_strength))
            
            # Add trigger words to collection
            all_trigger_words.extend(trigger_words)
        
        # use ',, ' to separate trigger words for group mode
        trigger_words_text = ",, ".join(all_trigger_words) if all_trigger_words else ""
        # Format active_loras as <lora:lora_name:strength> separated by spaces
        active_loras_text = " ".join([f"<lora:{name}:{str(strength).strip()}>" 
                                  for name, strength in active_loras])

        return (stack, trigger_words_text, active_loras_text)
