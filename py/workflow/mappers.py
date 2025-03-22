"""
Node mappers for ComfyUI workflow parsing
"""
import logging
import os
import importlib.util
import inspect
from typing import Dict, List, Any, Optional, Union, Type, Callable

logger = logging.getLogger(__name__)

# Global mapper registry
_MAPPER_REGISTRY: Dict[str, 'NodeMapper'] = {}

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
                    try:
                        ref_node_id, output_slot = input_value
                        # Convert node_id to string if it's an integer
                        if isinstance(ref_node_id, int):
                            ref_node_id = str(ref_node_id)
                        
                        # Recursively process the referenced node
                        ref_value = parser.process_node(ref_node_id, workflow)
                        
                        # Store the processed value
                        if ref_value is not None:
                            result[input_name] = ref_value
                        else:
                            # If we couldn't get a value from the reference, store the raw value
                            result[input_name] = input_value
                    except Exception as e:
                        logger.error(f"Error processing reference in node {node_id}, input {input_name}: {e}")
                        # If we couldn't process the reference, store the raw value
                        result[input_name] = input_value
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
            inputs_to_track=["loras", "lora_stack"]
        )
    
    def transform(self, inputs: Dict) -> Dict:
        # Fallback to loras array if text field doesn't exist or is invalid
        loras_data = inputs.get("loras", [])
        lora_stack = inputs.get("lora_stack", {}).get("lora_stack", [])
        
        # Process loras array - filter active entries
        lora_texts = []
        
        # Check if loras_data is a list or a dict with __value__ key (new format)
        if isinstance(loras_data, dict) and "__value__" in loras_data:
            loras_list = loras_data["__value__"]
        elif isinstance(loras_data, list):
            loras_list = loras_data
        else:
            loras_list = []
            
        # Process each active lora entry
        for lora in loras_list:
            logger.info(f"Lora: {lora}, active: {lora.get('active')}")
            if isinstance(lora, dict) and lora.get("active", False):
                lora_name = lora.get("name", "")
                strength = lora.get("strength", 1.0)
                lora_texts.append(f"<lora:{lora_name}:{strength}>")
        
        # Process lora_stack if it exists and is a valid format (list of tuples)
        if lora_stack and isinstance(lora_stack, list):
            # If lora_stack is a reference to another node ([node_id, output_slot]),
            # we don't process it here as it's already been processed recursively
            if len(lora_stack) == 2 and isinstance(lora_stack[0], (str, int)) and isinstance(lora_stack[1], int):
                # This is a reference to another node, already processed
                pass
            else:
                # Format each entry from the stack (assuming it's a list of tuples)
                for stack_entry in lora_stack:
                    lora_name = stack_entry[0]
                    strength = stack_entry[1]
                    lora_texts.append(f"<lora:{lora_name}:{strength}>")
        
        # Join with spaces
        combined_text = " ".join(lora_texts)
            
        return {"loras": combined_text}


class LoraStackerMapper(NodeMapper):
    """Mapper for LoraStacker nodes"""
    
    def __init__(self):
        super().__init__(
            node_type="Lora Stacker (LoraManager)",
            inputs_to_track=["loras", "lora_stack"]
        )
    
    def transform(self, inputs: Dict) -> Dict:
        loras_data = inputs.get("loras", [])
        existing_stack = inputs.get("lora_stack", {}).get("lora_stack", [])
        result_stack = []
        
        # Handle existing stack entries
        if existing_stack:
            # Check if existing_stack is a reference to another node ([node_id, output_slot])
            if isinstance(existing_stack, list) and len(existing_stack) == 2 and isinstance(existing_stack[0], (str, int)) and isinstance(existing_stack[1], int):
                # This is a reference to another node, should already be processed
                # So we'll need to extract the value from that node
                if isinstance(inputs.get("lora_stack", {}), dict) and "lora_stack" in inputs["lora_stack"]:
                    # If we have the processed result, use it
                    result_stack.extend(inputs["lora_stack"]["lora_stack"])
            elif isinstance(existing_stack, list):
                # If it's a regular list (not a node reference), just add the entries
                result_stack.extend(existing_stack)
        
        # Process loras array - filter active entries
        # Check if loras_data is a list or a dict with __value__ key (new format)
        if isinstance(loras_data, dict) and "__value__" in loras_data:
            loras_list = loras_data["__value__"]
        elif isinstance(loras_data, list):
            loras_list = loras_data
        else:
            loras_list = []
            
        # Process each active lora entry
        for lora in loras_list:
            if isinstance(lora, dict) and lora.get("active", False):
                lora_name = lora.get("name", "")
                strength = float(lora.get("strength", 1.0))
                result_stack.append((lora_name, strength))
        
        return {"lora_stack": result_stack}


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
            inputs_to_track=["toggle_trigger_words"]
        )
    
    def transform(self, inputs: Dict) -> str:
        toggle_data = inputs.get("toggle_trigger_words", [])

        # check if toggle_words is a list or a dict with __value__ key (new format)
        if isinstance(toggle_data, dict) and "__value__" in toggle_data:
            toggle_words = toggle_data["__value__"]
        elif isinstance(toggle_data, list):
            toggle_words = toggle_data
        else:
            toggle_words = []
        
        # Filter active trigger words
        active_words = []
        for item in toggle_words:
            if isinstance(item, dict) and item.get("active", False):
                word = item.get("text", "")
                if word and not word.startswith("__dummy"):
                    active_words.append(word)
        
        # Join with commas
        result = ", ".join(active_words)
        return result


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


# =============================================================================
# Mapper Registry Functions
# =============================================================================

def register_mapper(mapper: NodeMapper) -> None:
    """Register a node mapper in the global registry"""
    _MAPPER_REGISTRY[mapper.node_type] = mapper
    logger.debug(f"Registered mapper for node type: {mapper.node_type}")

def get_mapper(node_type: str) -> Optional[NodeMapper]:
    """Get a mapper for the specified node type"""
    return _MAPPER_REGISTRY.get(node_type)

def get_all_mappers() -> Dict[str, NodeMapper]:
    """Get all registered mappers"""
    return _MAPPER_REGISTRY.copy()

def register_default_mappers() -> None:
    """Register all default mappers"""
    default_mappers = [
        KSamplerMapper(),
        EmptyLatentImageMapper(),
        EmptySD3LatentImageMapper(),
        CLIPTextEncodeMapper(),
        LoraLoaderMapper(),
        LoraStackerMapper(),
        JoinStringsMapper(),
        StringConstantMapper(),
        TriggerWordToggleMapper(),
        FluxGuidanceMapper()
    ]
    
    for mapper in default_mappers:
        register_mapper(mapper)

# =============================================================================
# Extension Loading
# =============================================================================

def load_extensions(ext_dir: str = None) -> None:
    """
    Load mapper extensions from the specified directory
    
    Each Python file in the directory will be loaded, and any NodeMapper subclasses
    defined in those files will be automatically registered.
    """
    # Use default path if none provided
    if ext_dir is None:
        # Get the directory of this file
        current_dir = os.path.dirname(os.path.abspath(__file__))
        ext_dir = os.path.join(current_dir, 'ext')
    
    # Ensure the extension directory exists
    if not os.path.exists(ext_dir):
        os.makedirs(ext_dir, exist_ok=True)
        logger.info(f"Created extension directory: {ext_dir}")
        return
    
    # Load each Python file in the extension directory
    for filename in os.listdir(ext_dir):
        if filename.endswith('.py') and not filename.startswith('_'):
            module_path = os.path.join(ext_dir, filename)
            module_name = f"workflow.ext.{filename[:-3]}"  # Remove .py
            
            try:
                # Load the module
                spec = importlib.util.spec_from_file_location(module_name, module_path)
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    
                    # Find all NodeMapper subclasses in the module
                    for name, obj in inspect.getmembers(module):
                        if (inspect.isclass(obj) and issubclass(obj, NodeMapper) 
                                and obj != NodeMapper and hasattr(obj, 'node_type')):
                            # Instantiate and register the mapper
                            mapper = obj()
                            register_mapper(mapper)
                            logger.info(f"Loaded extension mapper: {mapper.node_type} from {filename}")
            
            except Exception as e:
                logger.error(f"Error loading extension {filename}: {e}")


# Initialize the registry with default mappers
register_default_mappers() 