from typing import Dict, Any
from .base_processor import NodeProcessor, register_processor

@register_processor
class EmptyLatentImageProcessor(NodeProcessor):
    """Processor for EmptyLatentImage nodes"""
    
    NODE_CLASS_TYPE = "EmptyLatentImage"
    REQUIRED_FIELDS = {"width", "height", "batch_size"}
    
    def process(self, workflow_parser) -> Dict[str, Any]:
        """Process an EmptyLatentImage node to extract image dimensions"""
        result = {}
        
        if "width" in self.inputs and "height" in self.inputs:
            width = self.inputs["width"]
            height = self.inputs["height"]
            result["width"] = width
            result["height"] = height
        
        return result 