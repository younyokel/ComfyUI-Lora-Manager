from typing import Dict, Any, List
from .base_processor import NodeProcessor, register_processor

@register_processor
class LoraStackerProcessor(NodeProcessor):
    """Processor for Lora Stacker (LoraManager) nodes"""
    
    NODE_CLASS_TYPE = "Lora Stacker (LoraManager)"
    REQUIRED_FIELDS = {"loras", "text", "lora_stack"}
    
    def process(self, workflow_parser) -> Dict[str, Any]:
        """Process a Lora Stacker node to extract lora stack"""
        result = {}
        
        # Get the direct lora text
        if "text" in self.inputs:
            lora_text = self.inputs.get("text", "")
            result["lora_text"] = lora_text
        
        # Process the loras array
        if "loras" in self.inputs:
            loras = self.inputs["loras"]
            active_loras = []
            
            if isinstance(loras, list):
                for lora in loras:
                    if (isinstance(lora, dict) and 
                        lora.get("active", False) and 
                        not lora.get("_isDummy", False) and
                        "name" in lora and "strength" in lora):
                        active_loras.append(f"<lora:{lora['name']}:{lora['strength']}>")
            
            if active_loras:
                result["active_loras"] = " ".join(active_loras)
        
        # Process the lora stack from a referenced node
        if "lora_stack" in self.inputs:
            stack_result = self.resolve_input("lora_stack", workflow_parser)
            if isinstance(stack_result, dict) and "lora_stack" in stack_result:
                # If we got a stack from another node, add it to our result
                if "active_loras" in result:
                    result["lora_stack"] = f"{result['active_loras']} {stack_result['lora_stack']}"
                else:
                    result["lora_stack"] = stack_result["lora_stack"]
            elif "active_loras" in result:
                # If there was no stack from the referenced node but we have active loras
                result["lora_stack"] = result["active_loras"]
        elif "active_loras" in result:
            # If there's no lora_stack input but we have active loras
            result["lora_stack"] = result["active_loras"]
            
        return result 