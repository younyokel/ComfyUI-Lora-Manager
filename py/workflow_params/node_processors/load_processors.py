"""Module to load all node processors"""

# Import all processor types to register them
from .ksampler_processor import KSamplerProcessor
from .clip_text_encode_processor import CLIPTextEncodeProcessor
from .empty_latent_image_processor import EmptyLatentImageProcessor
from .join_strings_processor import JoinStringsProcessor
from .string_constant_processor import StringConstantProcessor
from .clip_set_last_layer_processor import CLIPSetLastLayerProcessor
from .trigger_word_toggle_processor import TriggerWordToggleProcessor
from .lora_loader_processor import LoraLoaderProcessor
from .lora_stacker_processor import LoraStackerProcessor

# Update the node_processors/__init__.py to include this import
# This ensures all processors are registered when the package is imported 