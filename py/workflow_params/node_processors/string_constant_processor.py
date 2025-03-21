from typing import Dict, Any
from .base_processor import NodeProcessor, register_processor

@register_processor
class StringConstantProcessor(NodeProcessor):
    """Processor for StringConstantMultiline nodes"""
    
    NODE_CLASS_TYPE = "StringConstantMultiline"
    REQUIRED_FIELDS = {"string", "strip_newlines"}
    
    def process(self, workflow_parser) -> Dict[str, Any]:
        """Process a StringConstantMultiline node to extract the string content"""
        if "string" in self.inputs:
            string_value = self.inputs["string"]
            strip_newlines = self.inputs.get("strip_newlines", False)
            
            if strip_newlines and isinstance(string_value, str):
                string_value = string_value.replace("\n", " ")
            
            return string_value
        
        return None 