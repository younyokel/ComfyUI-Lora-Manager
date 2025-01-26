from .nodes import LorasEndpoint

NODE_CLASS_MAPPINGS = {
    "LorasEndpoint": LorasEndpoint
}

WEB_DIRECTORY = "./js"

# Add custom websocket event type
EXTENSION_WEB_SOCKET_MESSAGE_TYPES = ["lora-scan-progress"]

# Add this init function to properly register routes
def init():
    LorasEndpoint.add_routes()

__all__ = ['NODE_CLASS_MAPPINGS']