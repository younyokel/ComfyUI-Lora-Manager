"""
Example extension mapper for demonstrating the extension system
"""
from typing import Dict, Any
from ..mappers import NodeMapper

class ExampleNodeMapper(NodeMapper):
    """Example mapper for custom nodes"""
    
    def __init__(self):
        super().__init__(
            node_type="ExampleCustomNode",
            inputs_to_track=["param1", "param2", "image"]
        )
    
    def transform(self, inputs: Dict) -> Dict:
        """Transform extracted inputs into the desired output format"""
        result = {}
        
        # Extract interesting parameters
        if "param1" in inputs:
            result["example_param1"] = inputs["param1"]
        
        if "param2" in inputs:
            result["example_param2"] = inputs["param2"]
        
        # You can process the data in any way needed
        return result


class VAEMapperExtension(NodeMapper):
    """Extension mapper for VAE nodes"""
    
    def __init__(self):
        super().__init__(
            node_type="VAELoader",
            inputs_to_track=["vae_name"]
        )
    
    def transform(self, inputs: Dict) -> Dict:
        """Extract VAE information"""
        vae_name = inputs.get("vae_name", "")
        
        # Remove path prefix if present
        if "/" in vae_name or "\\" in vae_name:
            # Get just the filename without path or extension
            vae_name = vae_name.replace("\\", "/").split("/")[-1]
            vae_name = vae_name.split(".")[0]  # Remove extension
            
        return {"vae": vae_name}


# Note: No need to register manually - extensions are automatically registered
# when the extension system loads this file 