from .nodes import LorasEndpoint

NODE_CLASS_MAPPINGS = {
    "LorasEndpoint": LorasEndpoint
}

WEB_DIRECTORY = "./js"

# Add this init function to properly register routes
def init():
    LorasEndpoint.add_routes()

__all__ = ['NODE_CLASS_MAPPINGS']