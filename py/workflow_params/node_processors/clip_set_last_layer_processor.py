from typing import Dict, Any
from .base_processor import NodeProcessor, register_processor

@register_processor
class CLIPSetLastLayerProcessor(NodeProcessor):
    """Processor for CLIPSetLastLayer nodes"""
    
    NODE_CLASS_TYPE = "CLIPSetLastLayer"
    REQUIRED_FIELDS = {"stop_at_clip_layer", "clip"}
    
    def process(self, workflow_parser) -> Dict[str, Any]:
        """Process a CLIPSetLastLayer node to extract clip skip value"""
        if "stop_at_clip_layer" in self.inputs:
            # Convert to positive number for clip_skip
            layer = self.inputs["stop_at_clip_layer"]
            if isinstance(layer, (int, float)) and layer < 0:
                # CLIP skip is reported as a positive number
                # but stored as a negative layer index
                return {"clip_skip": str(abs(layer))}
        
        return None 