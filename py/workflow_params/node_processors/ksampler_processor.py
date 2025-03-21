from typing import Dict, Any, Set
from .base_processor import NodeProcessor, register_processor

@register_processor
class KSamplerProcessor(NodeProcessor):
    """Processor for KSampler nodes"""
    
    NODE_CLASS_TYPE = "KSampler"
    REQUIRED_FIELDS = {"seed", "steps", "cfg", "sampler_name", "scheduler", "denoise", 
                      "positive", "negative", "latent_image"}
    
    def process(self, workflow_parser) -> Dict[str, Any]:
        """Process a KSampler node to extract generation parameters"""
        result = {}
        
        # Directly extract numeric parameters
        if "seed" in self.inputs:
            result["seed"] = str(self.inputs["seed"])
        
        if "steps" in self.inputs:
            result["steps"] = str(self.inputs["steps"])
        
        if "cfg" in self.inputs:
            result["cfg_scale"] = str(self.inputs["cfg"])
        
        if "sampler_name" in self.inputs:
            result["sampler"] = self.inputs["sampler_name"]
        
        # Resolve referenced inputs
        if "positive" in self.inputs:
            positive_text = self.resolve_input("positive", workflow_parser)
            if positive_text:
                result["prompt"] = positive_text
        
        if "negative" in self.inputs:
            negative_text = self.resolve_input("negative", workflow_parser)
            if negative_text:
                result["negative_prompt"] = negative_text
        
        # Resolve latent image for size
        if "latent_image" in self.inputs:
            latent_info = self.resolve_input("latent_image", workflow_parser)
            if latent_info and "width" in latent_info and "height" in latent_info:
                result["size"] = f"{latent_info['width']}x{latent_info['height']}"
        
        return result 