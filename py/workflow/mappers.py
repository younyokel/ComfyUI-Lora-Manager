"""
Node mappers for ComfyUI workflow parsing
"""
import logging
from typing import Dict, List, Any, Optional, Union

logger = logging.getLogger(__name__)

class NodeMapper:
    """Base class for node mappers that define how to extract information from a specific node type"""
    
    def __init__(self, node_type: str, inputs_to_track: List[str]):
        self.node_type = node_type
        self.inputs_to_track = inputs_to_track
    
    def process(self, node_id: str, node_data: Dict, workflow: Dict, parser: 'WorkflowParser') -> Any: # type: ignore
        """Process the node and extract relevant information"""
        result = {}
        for input_name in self.inputs_to_track:
            if input_name in node_data.get("inputs", {}):
                input_value = node_data["inputs"][input_name]
                # Check if input is a reference to another node's output
                if isinstance(input_value, list) and len(input_value) == 2:
                    # Format is [node_id, output_slot]
                    ref_node_id, output_slot = input_value
                    # Recursively process the referenced node
                    ref_value = parser.process_node(str(ref_node_id), workflow)
                    result[input_name] = ref_value
                else:
                    # Direct value
                    result[input_name] = input_value
        
        # Apply any transformations
        return self.transform(result)
    
    def transform(self, inputs: Dict) -> Any:
        """Transform the extracted inputs - override in subclasses"""
        return inputs


class KSamplerMapper(NodeMapper):
    """Mapper for KSampler nodes"""
    
    def __init__(self):
        super().__init__(
            node_type="KSampler",
            inputs_to_track=["seed", "steps", "cfg", "sampler_name", "scheduler", 
                             "denoise", "positive", "negative", "latent_image",
                             "model", "clip_skip"]
        )
    
    def transform(self, inputs: Dict) -> Dict:
        result = {
            "seed": str(inputs.get("seed", "")),
            "steps": str(inputs.get("steps", "")),
            "cfg": str(inputs.get("cfg", "")),
            "sampler": inputs.get("sampler_name", ""),
            "scheduler": inputs.get("scheduler", ""),
        }
        
        # Process positive prompt
        if "positive" in inputs:
            result["prompt"] = inputs["positive"]
        
        # Process negative prompt
        if "negative" in inputs:
            result["negative_prompt"] = inputs["negative"]
        
        # Get dimensions from latent image
        if "latent_image" in inputs and isinstance(inputs["latent_image"], dict):
            width = inputs["latent_image"].get("width", 0)
            height = inputs["latent_image"].get("height", 0)
            if width and height:
                result["size"] = f"{width}x{height}"
        
        # Add clip_skip if present
        if "clip_skip" in inputs:
            result["clip_skip"] = str(inputs.get("clip_skip", ""))
            
        return result


class EmptyLatentImageMapper(NodeMapper):
    """Mapper for EmptyLatentImage nodes"""
    
    def __init__(self):
        super().__init__(
            node_type="EmptyLatentImage",
            inputs_to_track=["width", "height", "batch_size"]
        )
    
    def transform(self, inputs: Dict) -> Dict:
        width = inputs.get("width", 0)
        height = inputs.get("height", 0)
        return {"width": width, "height": height, "size": f"{width}x{height}"}


class EmptySD3LatentImageMapper(NodeMapper):
    """Mapper for EmptySD3LatentImage nodes"""
    
    def __init__(self):
        super().__init__(
            node_type="EmptySD3LatentImage",
            inputs_to_track=["width", "height", "batch_size"]
        )
    
    def transform(self, inputs: Dict) -> Dict:
        width = inputs.get("width", 0)
        height = inputs.get("height", 0)
        return {"width": width, "height": height, "size": f"{width}x{height}"}


class CLIPTextEncodeMapper(NodeMapper):
    """Mapper for CLIPTextEncode nodes"""
    
    def __init__(self):
        super().__init__(
            node_type="CLIPTextEncode",
            inputs_to_track=["text", "clip"]
        )
    
    def transform(self, inputs: Dict) -> Any:
        # Simply return the text
        return inputs.get("text", "")


class LoraLoaderMapper(NodeMapper):
    """Mapper for LoraLoader nodes"""
    
    def __init__(self):
        super().__init__(
            node_type="Lora Loader (LoraManager)",
            inputs_to_track=["text", "loras", "lora_stack"]
        )
    
    def transform(self, inputs: Dict) -> Dict:
        lora_text = inputs.get("text", "")
        lora_stack = inputs.get("lora_stack", [])
        
        # Process lora_stack if it exists
        stack_text = ""
        if lora_stack:
            # Handle the formatted lora_stack info if available
            stack_loras = []
            for lora_path, strength, _ in lora_stack:
                lora_name = lora_path.split(os.sep)[-1].split('.')[0]
                stack_loras.append(f"<lora:{lora_name}:{strength}>")
            stack_text = " ".join(stack_loras)
            
        # Combine lora_text and stack_text
        combined_text = lora_text
        if stack_text:
            combined_text = f"{combined_text} {stack_text}" if combined_text else stack_text
        
        # Format loras with spaces between them
        if combined_text:
            # Replace consecutive closing and opening tags with a space
            combined_text = combined_text.replace("><", "> <")
            
        return {"loras": combined_text}


class LoraStackerMapper(NodeMapper):
    """Mapper for LoraStacker nodes"""
    
    def __init__(self):
        super().__init__(
            node_type="Lora Stacker (LoraManager)",
            inputs_to_track=["loras", "lora_stack"]
        )
    
    def transform(self, inputs: Dict) -> Dict:
        # Return the lora_stack information
        return inputs.get("lora_stack", [])


class JoinStringsMapper(NodeMapper):
    """Mapper for JoinStrings nodes"""
    
    def __init__(self):
        super().__init__(
            node_type="JoinStrings",
            inputs_to_track=["string1", "string2", "delimiter"]
        )
    
    def transform(self, inputs: Dict) -> str:
        string1 = inputs.get("string1", "")
        string2 = inputs.get("string2", "")
        delimiter = inputs.get("delimiter", "")
        return f"{string1}{delimiter}{string2}"


class StringConstantMapper(NodeMapper):
    """Mapper for StringConstant and StringConstantMultiline nodes"""
    
    def __init__(self):
        super().__init__(
            node_type="StringConstantMultiline",
            inputs_to_track=["string"]
        )
    
    def transform(self, inputs: Dict) -> str:
        return inputs.get("string", "")


class TriggerWordToggleMapper(NodeMapper):
    """Mapper for TriggerWordToggle nodes"""
    
    def __init__(self):
        super().__init__(
            node_type="TriggerWord Toggle (LoraManager)",
            inputs_to_track=["toggle_trigger_words", "orinalMessage", "trigger_words"]
        )
    
    def transform(self, inputs: Dict) -> str:
        # Get the original message or toggled trigger words
        original_message = inputs.get("orinalMessage", "") or inputs.get("trigger_words", "")
        
        # Fix double commas to match the reference output format
        if original_message:
            # Replace double commas with single commas
            original_message = original_message.replace(",, ", ", ")
            
        return original_message


class FluxGuidanceMapper(NodeMapper):
    """Mapper for FluxGuidance nodes"""
    
    def __init__(self):
        super().__init__(
            node_type="FluxGuidance",
            inputs_to_track=["guidance", "conditioning"]
        )
    
    def transform(self, inputs: Dict) -> Dict:
        result = {}
        
        # Handle guidance parameter
        if "guidance" in inputs:
            result["guidance"] = inputs["guidance"]
        
        # Handle conditioning (the prompt text)
        if "conditioning" in inputs:
            conditioning = inputs["conditioning"]
            if isinstance(conditioning, str):
                result["prompt"] = conditioning
            else:
                result["prompt"] = "Unknown prompt"
        
        return result


# Add import os for LoraLoaderMapper to work properly
import os 