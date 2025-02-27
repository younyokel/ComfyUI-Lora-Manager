from .py.lora_manager import LoraManager
from .py.nodes.lora_loader import LoraManagerLoader
from .py.nodes.trigger_word_toggle import TriggerWordToggle

NODE_CLASS_MAPPINGS = {
    LoraManagerLoader.NAME: LoraManagerLoader,
    TriggerWordToggle.NAME: TriggerWordToggle
}

WEB_DIRECTORY = "./web/comfyui"

# Register routes on import
LoraManager.add_routes()
__all__ = ['NODE_CLASS_MAPPINGS', 'WEB_DIRECTORY']