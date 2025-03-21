from typing import Dict, Any
from .base_processor import NodeProcessor, register_processor

@register_processor
class FluxGuidanceProcessor(NodeProcessor):
    """Processor for Flux Guidance nodes"""
    
    NODE_CLASS_TYPE = "FluxGuidance"
    REQUIRED_FIELDS = {"guidance"}

    def process(self, workflow_parser) -> Dict[str, Any]:
        """Process a FluxGuidance node to extract guidance value"""
        result = {}

        positive_text = self.resolve_input("conditioning", workflow_parser)
        if positive_text:
            result["positive"] = positive_text
        
        if "guidance" in self.inputs:
            result["guidance"] = str(self.inputs["guidance"])
        return result

