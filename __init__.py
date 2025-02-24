from .py.lora_manager import LoraManager
from .py.nodes.lora_loader import LoraManagerLoader

NODE_CLASS_MAPPINGS = {
    LoraManagerLoader.NAME: LoraManagerLoader
}

WEB_DIRECTORY = "./web/comfyui"

# Register routes on import
LoraManager.add_routes()
__all__ = ['NODE_CLASS_MAPPINGS', 'WEB_DIRECTORY']