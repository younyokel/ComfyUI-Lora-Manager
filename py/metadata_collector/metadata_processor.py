import json

class MetadataProcessor:
    """Process and format collected metadata"""
    
    @staticmethod
    def find_primary_sampler(metadata):
        """Find the primary KSampler node (with denoise=1)"""
        primary_sampler = None
        primary_sampler_id = None
        
        for node_id, sampler_info in metadata.get("sampling", {}).items():
            parameters = sampler_info.get("parameters", {})
            denoise = parameters.get("denoise")
            
            # If denoise is 1.0, this is likely the primary sampler
            if denoise == 1.0 or denoise == 1:
                primary_sampler = sampler_info
                primary_sampler_id = node_id
                break
                
        return primary_sampler_id, primary_sampler
    
    @staticmethod
    def trace_node_input(prompt, node_id, input_name):
        """Trace an input connection from a node to find the source node"""
        if not prompt or not prompt.original_prompt or node_id not in prompt.original_prompt:
            return None
            
        node_inputs = prompt.original_prompt[node_id].get("inputs", {})
        if input_name not in node_inputs:
            return None
            
        input_value = node_inputs[input_name]
        # Input connections are formatted as [node_id, output_index]
        if isinstance(input_value, list) and len(input_value) >= 2:
            return input_value[0]  # Return connected node_id
            
        return None
    
    @staticmethod
    def find_primary_checkpoint(metadata):
        """Find the primary checkpoint model in the workflow"""
        if not metadata.get("models"):
            return None
            
        # In most workflows, there's only one checkpoint, so we can just take the first one
        for node_id, model_info in metadata.get("models", {}).items():
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
            "sampler": None,
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
            params["seed"] = sampling_params.get("seed")
            params["steps"] = sampling_params.get("steps")
            params["cfg_scale"] = sampling_params.get("cfg")
            params["sampler"] = sampling_params.get("sampler_name")
            
            # Trace connections from the primary sampler
            if prompt and primary_sampler_id:
                # Trace positive prompt
                positive_node_id = MetadataProcessor.trace_node_input(prompt, primary_sampler_id, "positive")
                if positive_node_id and positive_node_id in metadata.get("prompts", {}):
                    params["prompt"] = metadata["prompts"][positive_node_id].get("text", "")
                
                # Trace negative prompt
                negative_node_id = MetadataProcessor.trace_node_input(prompt, primary_sampler_id, "negative")
                if negative_node_id and negative_node_id in metadata.get("prompts", {}):
                    params["negative_prompt"] = metadata["prompts"][negative_node_id].get("text", "")
                
                # Check if the sampler itself has size information (from latent_image)
                if primary_sampler_id in metadata.get("size", {}):
                    width = metadata["size"][primary_sampler_id].get("width")
                    height = metadata["size"][primary_sampler_id].get("height")
                    if width and height:
                        params["size"] = f"{width}x{height}"
                else:
                    # Fallback to the previous trace method if needed
                    latent_node_id = MetadataProcessor.trace_node_input(prompt, primary_sampler_id, "latent_image")
                    if latent_node_id:
                        # Follow chain to find EmptyLatentImage node
                        size_found = False
                        current_node_id = latent_node_id
                        
                        # Limit depth to avoid infinite loops in complex workflows
                        max_depth = 10
                        for _ in range(max_depth):
                            if current_node_id in metadata.get("size", {}):
                                width = metadata["size"][current_node_id].get("width")
                                height = metadata["size"][current_node_id].get("height")
                                if width and height:
                                    params["size"] = f"{width}x{height}"
                                    size_found = True
                                    break
                            
                            # Try to follow the chain
                            if prompt and prompt.original_prompt and current_node_id in prompt.original_prompt:
                                node_info = prompt.original_prompt[current_node_id]
                                if "inputs" in node_info:
                                    # Look for a connection that might lead to size information
                                    for input_name, input_value in node_info["inputs"].items():
                                        if isinstance(input_value, list) and len(input_value) >= 2:
                                            current_node_id = input_value[0]
                                            break
                                    else:
                                        break  # No connections to follow
                                else:
                                    break  # No inputs to follow
                            else:
                                break  # Can't follow further
        
        # Extract LoRAs using the standardized format
        lora_parts = []
        for node_id, lora_info in metadata.get("loras", {}).items():
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
    def to_comfyui_format(metadata):
        """Convert extracted metadata to the ComfyUI output.json format"""           
        params = MetadataProcessor.extract_generation_params(metadata)
        
        # Convert all values to strings to match output.json format
        for key in params:
            if params[key] is not None:
                params[key] = str(params[key])
        
        return params
    
    @staticmethod
    def to_json(metadata):
        """Convert metadata to JSON string"""
        params = MetadataProcessor.to_comfyui_format(metadata)
        return json.dumps(params, indent=4)
