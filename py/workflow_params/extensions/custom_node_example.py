"""
Example of how to extend the workflow parser with custom node processors
This file is not imported automatically - it serves as a template for creating extensions
"""

from typing import Dict, Any
from ..node_processors import NodeProcessor, register_processor

@register_processor
class CustomNodeProcessor(NodeProcessor):
    """Example processor for a custom node type"""
    
    NODE_CLASS_TYPE = "CustomNodeType"
    REQUIRED_FIELDS = {"custom_field1", "custom_field2"}
    
    def process(self, workflow_parser) -> Dict[str, Any]:
        """Process a custom node"""
        # Example implementation
        result = {}
        
        # Extract direct values
        if "custom_field1" in self.inputs:
            result["custom_value1"] = self.inputs["custom_field1"]
            
        # Resolve references to other nodes
        if "custom_field2" in self.inputs:
            resolved_value = self.resolve_input("custom_field2", workflow_parser)
            if resolved_value:
                result["custom_value2"] = resolved_value
                
        return result

# To use this extension, you would need to:
# 1. Save this file in the extensions directory
# 2. Import it in your code before using the WorkflowParser
#
# For example:
#
# from workflow_params.extensions import custom_node_example
# from workflow_params import WorkflowParser
#
# parser = WorkflowParser()
# result = parser.parse_workflow(workflow_json) 