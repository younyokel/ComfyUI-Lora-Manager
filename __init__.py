from .lora_manager import LoraManager
from .nodes.lora_gateway import LoRAGateway

NODE_CLASS_MAPPINGS = {
    "LoRAGateway": LoRAGateway
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoRAGateway": "LoRAGateway"
}

WEB_DIRECTORY = "./js"

# Register routes on import
LoraManager.add_routes()
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']