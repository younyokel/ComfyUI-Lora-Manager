"""
KJNodes mappers extension for ComfyUI workflow parsing
"""
import logging
import re
from typing import Dict, Any

logger = logging.getLogger(__name__)

# =============================================================================
# Transform Functions
# =============================================================================

def transform_join_strings(inputs: Dict) -> str:
    """Transform function for JoinStrings nodes"""
    string1 = inputs.get("string1", "")
    string2 = inputs.get("string2", "")
    delimiter = inputs.get("delimiter", "")
    return f"{string1}{delimiter}{string2}"

def transform_string_constant(inputs: Dict) -> str:
    """Transform function for StringConstant nodes"""
    return inputs.get("string", "")

def transform_empty_latent_presets(inputs: Dict) -> Dict:
    """Transform function for EmptyLatentImagePresets nodes"""
    dimensions = inputs.get("dimensions", "")
    invert = inputs.get("invert", False)
    
    # Extract width and height from dimensions string
    # Expected format: "width x height (ratio)" or similar
    width = 0
    height = 0
    
    if dimensions:
        # Try to extract dimensions using regex
        match = re.search(r'(\d+)\s*x\s*(\d+)', dimensions)
        if match:
            width = int(match.group(1))
            height = int(match.group(2))
    
    # If invert is True, swap width and height
    if invert and width and height:
        width, height = height, width
    
    return {"width": width, "height": height, "size": f"{width}x{height}"}

def transform_int_constant(inputs: Dict) -> int:
    """Transform function for INTConstant nodes"""
    return inputs.get("value", 0)

# =============================================================================
# Node Mapper Definitions
# =============================================================================

# Define the mappers for KJNodes
NODE_MAPPERS_EXT = {
    "JoinStrings": {
        "inputs_to_track": ["string1", "string2", "delimiter"],
        "transform_func": transform_join_strings
    },
    "StringConstantMultiline": {
        "inputs_to_track": ["string"],
        "transform_func": transform_string_constant
    },
    "EmptyLatentImagePresets": {
        "inputs_to_track": ["dimensions", "invert", "batch_size"],
        "transform_func": transform_empty_latent_presets
    },
    "INTConstant": {
        "inputs_to_track": ["value"],
        "transform_func": transform_int_constant
    }
} 