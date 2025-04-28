import json
import sys

# Check if running in standalone mode
standalone_mode = 'nodes' not in sys.modules

from .constants import MODELS, PROMPTS, SAMPLING, LORAS, SIZE

class MetadataProcessor:
    """Process and format collected metadata"""
    
    @staticmethod
    def find_primary_sampler(metadata):
        """Find the primary KSampler node (with highest denoise value)"""
        primary_sampler = None
        primary_sampler_id = None
        max_denoise = -1  # Track the highest denoise value
        
        # First, check for SamplerCustomAdvanced
        prompt = metadata.get("current_prompt")
        if prompt and prompt.original_prompt:
            for node_id, node_info in prompt.original_prompt.items():
                if node_info.get("class_type") == "SamplerCustomAdvanced":
                    # Found a SamplerCustomAdvanced node
                    if node_id in metadata.get(SAMPLING, {}):
                        return node_id, metadata[SAMPLING][node_id]
        
        # Next, check for KSamplerAdvanced with add_noise="enable"
        for node_id, sampler_info in metadata.get(SAMPLING, {}).items():
            parameters = sampler_info.get("parameters", {})
            add_noise = parameters.get("add_noise")
            
            # If add_noise is "enable", this is likely the primary sampler for KSamplerAdvanced
            if add_noise == "enable":
                primary_sampler = sampler_info
                primary_sampler_id = node_id
                break
        
        # If no specialized sampler found, find the sampler with highest denoise value
        if primary_sampler is None:
            for node_id, sampler_info in metadata.get(SAMPLING, {}).items():
                parameters = sampler_info.get("parameters", {})
                denoise = parameters.get("denoise")
                
                # If denoise exists and is higher than current max, use this sampler
                if denoise is not None and denoise > max_denoise:
                    max_denoise = denoise
                    primary_sampler = sampler_info
                    primary_sampler_id = node_id
                
        return primary_sampler_id, primary_sampler
    
    @staticmethod
    def trace_node_input(prompt, node_id, input_name, target_class=None, max_depth=10):
        """
        Trace an input connection from a node to find the source node
        
        Parameters:
        - prompt: The prompt object containing node connections
        - node_id: ID of the starting node
        - input_name: Name of the input to trace
        - target_class: Optional class name to search for (e.g., "CLIPTextEncode")
        - max_depth: Maximum depth to follow the node chain to prevent infinite loops
        
        Returns:
        - node_id of the found node, or None if not found
        """
        if not prompt or not prompt.original_prompt or node_id not in prompt.original_prompt:
            return None
            
        # For depth tracking
        current_depth = 0
        
        current_node_id = node_id
        current_input = input_name
        
        while current_depth < max_depth:
            if current_node_id not in prompt.original_prompt:
                return None
                
            node_inputs = prompt.original_prompt[current_node_id].get("inputs", {})
            if current_input not in node_inputs:
                return None
                
            input_value = node_inputs[current_input]
            # Input connections are formatted as [node_id, output_index]
            if isinstance(input_value, list) and len(input_value) >= 2:
                found_node_id = input_value[0]  # Connected node_id
                
                # If we're looking for a specific node class
                if target_class and prompt.original_prompt[found_node_id].get("class_type") == target_class:
                    return found_node_id
                
                # If we're not looking for a specific class or haven't found it yet
                if not target_class:
                    return found_node_id
                
                # Continue tracing through intermediate nodes
                current_node_id = found_node_id
                # For most conditioning nodes, the input we want to follow is named "conditioning"
                if "conditioning" in prompt.original_prompt[current_node_id].get("inputs", {}):
                    current_input = "conditioning"
                else:
                    # If there's no "conditioning" input, we can't trace further
                    return found_node_id if not target_class else None
            else:
                # We've reached a node with no further connections
                return None
            
            current_depth += 1
            
        # If we've reached max depth without finding target_class
        return None
    
    @staticmethod
    def find_primary_checkpoint(metadata):
        """Find the primary checkpoint model in the workflow"""
        if not metadata.get(MODELS):
            return None
            
        # In most workflows, there's only one checkpoint, so we can just take the first one
        for node_id, model_info in metadata.get(MODELS, {}).items():
            if model_info.get("type") == "checkpoint":
                return model_info.get("name")
                
        return None
    
    @staticmethod
    def extract_generation_params(metadata):
        """Extract generation parameters from metadata using node relationships"""
        params = {
            "prompt": "",
            "negative_prompt": "",
            "seed": None,
            "steps": None,
            "cfg_scale": None,
            "guidance": None,  # Add guidance parameter
            "sampler": None,
            "scheduler": None,
            "checkpoint": None,
            "loras": "",
            "size": None,
            "clip_skip": None
        }
        
        # Get the prompt object for node relationship tracing
        prompt = metadata.get("current_prompt")
        
        # Find the primary KSampler node
        primary_sampler_id, primary_sampler = MetadataProcessor.find_primary_sampler(metadata)
        
        # Directly get checkpoint from metadata instead of tracing
        checkpoint = MetadataProcessor.find_primary_checkpoint(metadata)
        if checkpoint:
            params["checkpoint"] = checkpoint
        
        if primary_sampler:
            # Extract sampling parameters
            sampling_params = primary_sampler.get("parameters", {})
            # Handle both seed and noise_seed
            params["seed"] = sampling_params.get("seed") if sampling_params.get("seed") is not None else sampling_params.get("noise_seed")
            params["steps"] = sampling_params.get("steps")
            params["cfg_scale"] = sampling_params.get("cfg")
            params["sampler"] = sampling_params.get("sampler_name")
            params["scheduler"] = sampling_params.get("scheduler")
            
            # Trace connections from the primary sampler
            if prompt and primary_sampler_id:
                # Check if this is a SamplerCustomAdvanced node
                is_custom_advanced = False
                if prompt.original_prompt and primary_sampler_id in prompt.original_prompt:
                    is_custom_advanced = prompt.original_prompt[primary_sampler_id].get("class_type") == "SamplerCustomAdvanced"
                
                if is_custom_advanced:
                    # For SamplerCustomAdvanced, trace specific inputs
                    
                    # 1. Trace sigmas input to find BasicScheduler
                    scheduler_node_id = MetadataProcessor.trace_node_input(prompt, primary_sampler_id, "sigmas", "BasicScheduler", max_depth=5)
                    if scheduler_node_id and scheduler_node_id in metadata.get(SAMPLING, {}):
                        scheduler_params = metadata[SAMPLING][scheduler_node_id].get("parameters", {})
                        params["steps"] = scheduler_params.get("steps")
                        params["scheduler"] = scheduler_params.get("scheduler")
                    
                    # 2. Trace sampler input to find KSamplerSelect
                    sampler_node_id = MetadataProcessor.trace_node_input(prompt, primary_sampler_id, "sampler", "KSamplerSelect", max_depth=5)
                    if sampler_node_id and sampler_node_id in metadata.get(SAMPLING, {}):
                        sampler_params = metadata[SAMPLING][sampler_node_id].get("parameters", {})
                        params["sampler"] = sampler_params.get("sampler_name")
                    
                    # 3. Trace guider input for FluxGuidance and CLIPTextEncode
                    guider_node_id = MetadataProcessor.trace_node_input(prompt, primary_sampler_id, "guider", max_depth=5)
                    if guider_node_id:
                        # Look for FluxGuidance along the guider path
                        flux_node_id = MetadataProcessor.trace_node_input(prompt, guider_node_id, "conditioning", "FluxGuidance", max_depth=5)
                        if flux_node_id and flux_node_id in metadata.get(SAMPLING, {}):
                            flux_params = metadata[SAMPLING][flux_node_id].get("parameters", {})
                            params["guidance"] = flux_params.get("guidance")
                        
                        # Find CLIPTextEncode for positive prompt (through conditioning)
                        positive_node_id = MetadataProcessor.trace_node_input(prompt, guider_node_id, "conditioning", "CLIPTextEncode", max_depth=10)
                        if positive_node_id and positive_node_id in metadata.get(PROMPTS, {}):
                            params["prompt"] = metadata[PROMPTS][positive_node_id].get("text", "")
                
                else:
                    # Original tracing for standard samplers
                    # Trace positive prompt - look specifically for CLIPTextEncode
                    positive_node_id = MetadataProcessor.trace_node_input(prompt, primary_sampler_id, "positive", "CLIPTextEncode", max_depth=10)
                    if positive_node_id and positive_node_id in metadata.get(PROMPTS, {}):
                        params["prompt"] = metadata[PROMPTS][positive_node_id].get("text", "")
                    else:
                        # If CLIPTextEncode is not found, try to find CLIPTextEncodeFlux
                        positive_flux_node_id = MetadataProcessor.trace_node_input(prompt, primary_sampler_id, "positive", "CLIPTextEncodeFlux", max_depth=10)
                        if positive_flux_node_id and positive_flux_node_id in metadata.get(PROMPTS, {}):
                            params["prompt"] = metadata[PROMPTS][positive_flux_node_id].get("text", "")
                            
                            # Also extract guidance value if present in the sampling data
                            if positive_flux_node_id in metadata.get(SAMPLING, {}):
                                flux_params = metadata[SAMPLING][positive_flux_node_id].get("parameters", {})
                                if "guidance" in flux_params:
                                    params["guidance"] = flux_params.get("guidance")
                    
                    # Find any FluxGuidance nodes in the positive conditioning path
                    flux_node_id = MetadataProcessor.trace_node_input(prompt, primary_sampler_id, "positive", "FluxGuidance", max_depth=5)
                    if flux_node_id and flux_node_id in metadata.get(SAMPLING, {}):
                        flux_params = metadata[SAMPLING][flux_node_id].get("parameters", {})
                        params["guidance"] = flux_params.get("guidance")
                    
                    # Trace negative prompt - look specifically for CLIPTextEncode
                    negative_node_id = MetadataProcessor.trace_node_input(prompt, primary_sampler_id, "negative", "CLIPTextEncode", max_depth=10)
                    if negative_node_id and negative_node_id in metadata.get(PROMPTS, {}):
                        params["negative_prompt"] = metadata[PROMPTS][negative_node_id].get("text", "")
                
                # Size extraction is same for all sampler types
                # Check if the sampler itself has size information (from latent_image)
                if primary_sampler_id in metadata.get(SIZE, {}):
                    width = metadata[SIZE][primary_sampler_id].get("width")
                    height = metadata[SIZE][primary_sampler_id].get("height")
                    if width and height:
                        params["size"] = f"{width}x{height}"
        
        # Extract LoRAs using the standardized format
        lora_parts = []
        for node_id, lora_info in metadata.get(LORAS, {}).items():
            # Access the lora_list from the standardized format
            lora_list = lora_info.get("lora_list", [])
            for lora in lora_list:
                name = lora.get("name", "unknown")
                strength = lora.get("strength", 1.0)
                lora_parts.append(f"<lora:{name}:{strength}>")
        
        params["loras"] = " ".join(lora_parts)
        
        # Set default clip_skip value
        params["clip_skip"] = "1"  # Common default
        
        return params
    
    @staticmethod
    def to_dict(metadata):
        """Convert extracted metadata to the ComfyUI output.json format"""           
        if standalone_mode:
            # Return empty dictionary in standalone mode
            return {}
        
        params = MetadataProcessor.extract_generation_params(metadata)
        
        # Convert all values to strings to match output.json format
        for key in params:
            if params[key] is not None:
                params[key] = str(params[key])
        
        return params
    
    @staticmethod
    def to_json(metadata):
        """Convert metadata to JSON string"""
        params = MetadataProcessor.to_dict(metadata)
        return json.dumps(params, indent=4)
