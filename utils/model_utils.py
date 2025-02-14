from typing import Dict, Optional

# Base model mapping based on version string
BASE_MODEL_MAPPING = {
    "sd-v1-5": "SD1.5",
    "sd-v2-1": "SD2.1",
    "sdxl": "SDXL",
    "sd-v2": "SD2.0",
    "flux1": "Flux.1 D",
    "Illustrious": "IL"
}

def determine_base_model(version_string: Optional[str]) -> str:
    """Determine base model from version string in safetensors metadata"""
    if not version_string:
        return "Unknown"
    
    version_lower = version_string.lower()
    for key, value in BASE_MODEL_MAPPING.items():
        if key in version_lower:
            return value
    
    return "Unknown" 