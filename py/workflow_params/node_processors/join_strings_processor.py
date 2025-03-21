from typing import Dict, Any
from .base_processor import NodeProcessor, register_processor

@register_processor
class JoinStringsProcessor(NodeProcessor):
    """Processor for JoinStrings nodes"""
    
    NODE_CLASS_TYPE = "JoinStrings"
    REQUIRED_FIELDS = {"string1", "string2", "delimiter"}
    
    def process(self, workflow_parser) -> Dict[str, Any]:
        """Process a JoinStrings node to combine strings"""
        string1 = self.resolve_input("string1", workflow_parser)
        string2 = self.resolve_input("string2", workflow_parser)
        delimiter = self.inputs.get("delimiter", ", ")
        
        if string1 is None and string2 is None:
            return None
        
        if string1 is None:
            return string2
        
        if string2 is None:
            return string1
        
        # Join the strings with the delimiter
        return f"{string1}{delimiter}{string2}" 