from typing import Dict, Any
from .base_processor import NodeProcessor, register_processor

@register_processor
class CLIPTextEncodeProcessor(NodeProcessor):
    """Processor for CLIPTextEncode nodes"""
    
    NODE_CLASS_TYPE = "CLIPTextEncode"
    REQUIRED_FIELDS = {"text", "clip"}
    
    def process(self, workflow_parser) -> Dict[str, Any]:
        """Process a CLIPTextEncode node to extract text prompt"""
        if "text" in self.inputs:
            # Text might be a direct string or a reference to another node
            text_value = self.resolve_input("text", workflow_parser)
            return text_value
        
        return None 