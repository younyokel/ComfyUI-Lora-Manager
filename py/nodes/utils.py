class AnyType(str):
  """A special class that is always equal in not equal comparisons. Credit to pythongosssss"""

  def __ne__(self, __value: object) -> bool:
    return False

# Credit to Regis Gaughan, III (rgthree)
class FlexibleOptionalInputType(dict):
  """A special class to make flexible nodes that pass data to our python handlers.

  Enables both flexible/dynamic input types (like for Any Switch) or a dynamic number of inputs
  (like for Any Switch, Context Switch, Context Merge, Power Lora Loader, etc).

  Note, for ComfyUI, all that's needed is the `__contains__` override below, which tells ComfyUI
  that our node will handle the input, regardless of what it is.

  However, with https://github.com/comfyanonymous/ComfyUI/pull/2666 a large change would occur
  requiring more details on the input itself. There, we need to return a list/tuple where the first
  item is the type. This can be a real type, or use the AnyType for additional flexibility.

  This should be forwards compatible unless more changes occur in the PR.
  """
  def __init__(self, type):
    self.type = type

  def __getitem__(self, key):
    return (self.type, )

  def __contains__(self, key):
    return True


any_type = AnyType("*")

# Common methods extracted from lora_loader.py and lora_stacker.py
import os
import logging
import asyncio
from ..services.lora_scanner import LoraScanner
from ..config import config

logger = logging.getLogger(__name__)

async def get_lora_info(lora_name):
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

def extract_lora_name(lora_path):
    """Extract the lora name from a lora path (e.g., 'IL\\aorunIllstrious.safetensors' -> 'aorunIllstrious')"""
    # Get the basename without extension
    basename = os.path.basename(lora_path)
    return os.path.splitext(basename)[0]

def get_loras_list(kwargs):
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