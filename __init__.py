from .lora_manager import LoraManager
from .nodes.lora_loader import LoraManagerLoader

NODE_CLASS_MAPPINGS = {
    "LoRALoader": LoraManagerLoader
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoRALoader": "Lora Loader (LoraManager)"
}

WEB_DIRECTORY = "./web/comfyui"

# Register routes on import
LoraManager.add_routes()
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']