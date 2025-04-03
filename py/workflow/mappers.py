"""
Node mappers for ComfyUI workflow parsing
"""
import logging
import os
import importlib.util
import inspect
from typing import Dict, List, Any, Optional, Union, Type, Callable, Tuple

logger = logging.getLogger(__name__)

# Global mapper registry
_MAPPER_REGISTRY: Dict[str, Dict] = {}

# =============================================================================
# Mapper Definition Functions
# =============================================================================

def create_mapper(
    node_type: str,
    inputs_to_track: List[str],
    transform_func: Callable[[Dict], Any] = None
) -> Dict:
    """Create a mapper definition for a node type"""
    mapper = {
        "node_type": node_type,
        "inputs_to_track": inputs_to_track,
        "transform": transform_func or (lambda inputs: inputs)
    }
    return mapper

def register_mapper(mapper: Dict) -> None:
    """Register a node mapper in the global registry"""
    _MAPPER_REGISTRY[mapper["node_type"]] = mapper
    logger.debug(f"Registered mapper for node type: {mapper['node_type']}")

def get_mapper(node_type: str) -> Optional[Dict]:
    """Get a mapper for the specified node type"""
    return _MAPPER_REGISTRY.get(node_type)

def get_all_mappers() -> Dict[str, Dict]:
    """Get all registered mappers"""
    return _MAPPER_REGISTRY.copy()

# =============================================================================
# Node Processing Function
# =============================================================================

def process_node(node_id: str, node_data: Dict, workflow: Dict, parser: 'WorkflowParser') -> Any: # type: ignore
    """Process a node using its mapper and extract relevant information"""
    node_type = node_data.get("class_type")
    mapper = get_mapper(node_type)
    
    if not mapper:
        logger.warning(f"No mapper found for node type: {node_type}")
        return None
        
    result = {}
    
    # Extract inputs based on the mapper's tracked inputs
    for input_name in mapper["inputs_to_track"]:
        if input_name in node_data.get("inputs", {}):
            input_value = node_data["inputs"][input_name]
            
            # Check if input is a reference to another node's output
            if isinstance(input_value, list) and len(input_value) == 2:
                try:
                    # Format is [node_id, output_slot]
                    ref_node_id, output_slot = input_value
                    # Convert node_id to string if it's an integer
                    if isinstance(ref_node_id, int):
                        ref_node_id = str(ref_node_id)
                    
                    # Recursively process the referenced node
                    ref_value = parser.process_node(ref_node_id, workflow)
                    
                    if ref_value is not None:
                        result[input_name] = ref_value
                    else:
                        # If we couldn't get a value from the reference, store the raw value
                        result[input_name] = input_value
                except Exception as e:
                    logger.error(f"Error processing reference in node {node_id}, input {input_name}: {e}")
                    result[input_name] = input_value
            else:
                # Direct value
                result[input_name] = input_value
    
    # Apply the transform function
    try:
        return mapper["transform"](result)
    except Exception as e:
        logger.error(f"Error in transform function for node {node_id} of type {node_type}: {e}")
        return result

# =============================================================================
# Transform Functions
# =============================================================================



def transform_lora_loader(inputs: Dict) -> Dict:
    """Transform function for LoraLoader nodes"""
    loras_data = inputs.get("loras", [])
    lora_stack = inputs.get("lora_stack", {}).get("lora_stack", [])
    
    lora_texts = []
    
    # Process loras array
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
            strength = lora.get("strength", 1.0)
            lora_texts.append(f"<lora:{lora_name}:{strength}>")
    
    # Process lora_stack if valid
    if lora_stack and isinstance(lora_stack, list):
        if not (len(lora_stack) == 2 and isinstance(lora_stack[0], (str, int)) and isinstance(lora_stack[1], int)):
            for stack_entry in lora_stack:
                lora_name = stack_entry[0]
                strength = stack_entry[1]
                lora_texts.append(f"<lora:{lora_name}:{strength}>")

    result = {
        "checkpoint": inputs.get("model", {}).get("checkpoint", ""),
        "loras": " ".join(lora_texts)
    }

    if "clip" in inputs and isinstance(inputs["clip"], dict):
        result["clip_skip"] = inputs["clip"].get("clip_skip", "-1")
    
    return result

def transform_lora_stacker(inputs: Dict) -> Dict:
    """Transform function for LoraStacker nodes"""
    loras_data = inputs.get("loras", [])
    result_stack = []
    
    # Handle existing stack entries
    existing_stack = []
    lora_stack_input = inputs.get("lora_stack", [])
    
    if isinstance(lora_stack_input, dict) and "lora_stack" in lora_stack_input:
        existing_stack = lora_stack_input["lora_stack"]
    elif isinstance(lora_stack_input, list):
        if not (len(lora_stack_input) == 2 and isinstance(lora_stack_input[0], (str, int)) and 
               isinstance(lora_stack_input[1], int)):
            existing_stack = lora_stack_input
    
    # Add existing entries
    if existing_stack:
        result_stack.extend(existing_stack)
    
    # Process new loras
    if isinstance(loras_data, dict) and "__value__" in loras_data:
        loras_list = loras_data["__value__"]
    elif isinstance(loras_data, list):
        loras_list = loras_data
    else:
        loras_list = []
        
    for lora in loras_list:
        if isinstance(lora, dict) and lora.get("active", False):
            lora_name = lora.get("name", "")
            strength = float(lora.get("strength", 1.0))
            result_stack.append((lora_name, strength))
    
    return {"lora_stack": result_stack}

def transform_trigger_word_toggle(inputs: Dict) -> str:
    """Transform function for TriggerWordToggle nodes"""
    toggle_data = inputs.get("toggle_trigger_words", [])

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
    
    return ", ".join(active_words)

# =============================================================================
# Node Mapper Definitions
# =============================================================================

# Central definition of all supported node types and their configurations
NODE_MAPPERS = {
    
    # LoraManager nodes
    "Lora Loader (LoraManager)": {
        "inputs_to_track": ["model", "clip", "loras", "lora_stack"],
        "transform_func": transform_lora_loader
    },
    "Lora Stacker (LoraManager)": {
        "inputs_to_track": ["loras", "lora_stack"],
        "transform_func": transform_lora_stacker
    },
    "TriggerWord Toggle (LoraManager)": {
        "inputs_to_track": ["toggle_trigger_words"],
        "transform_func": transform_trigger_word_toggle
    }   
}

def register_all_mappers() -> None:
    """Register all mappers from the NODE_MAPPERS dictionary"""
    for node_type, config in NODE_MAPPERS.items():
        mapper = create_mapper(
            node_type=node_type,
            inputs_to_track=config["inputs_to_track"],
            transform_func=config["transform_func"]
        )
        register_mapper(mapper)
    logger.info(f"Registered {len(NODE_MAPPERS)} node mappers")

# =============================================================================
# Extension Loading
# =============================================================================

def load_extensions(ext_dir: str = None) -> None:
    """
    Load mapper extensions from the specified directory
    
    Extension files should define a NODE_MAPPERS_EXT dictionary containing mapper configurations.
    These will be added to the global NODE_MAPPERS dictionary and registered automatically.
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
                    
                    # Check if the module defines NODE_MAPPERS_EXT
                    if hasattr(module, 'NODE_MAPPERS_EXT'):
                        # Add the extension mappers to the global NODE_MAPPERS dictionary
                        NODE_MAPPERS.update(module.NODE_MAPPERS_EXT)
                        logger.info(f"Added {len(module.NODE_MAPPERS_EXT)} mappers from extension: {filename}")
                    else:
                        logger.warning(f"Extension {filename} does not define NODE_MAPPERS_EXT dictionary")
            except Exception as e:
                logger.warning(f"Error loading extension {filename}: {e}")
    
    # Re-register all mappers after loading extensions
    register_all_mappers()

# Initialize the registry with default mappers
# register_default_mappers() 