import os
import importlib
from .metadata_hook import MetadataHook
from .metadata_registry import MetadataRegistry

def init():
    # Install hooks to collect metadata during execution
    MetadataHook.install()
    
    # Initialize registry
    registry = MetadataRegistry()
    
    print("ComfyUI Metadata Collector initialized")
    
def get_metadata(prompt_id=None):
    """Helper function to get metadata from the registry"""
    registry = MetadataRegistry()
    return registry.get_metadata(prompt_id)
