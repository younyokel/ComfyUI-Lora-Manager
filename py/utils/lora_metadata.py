from safetensors import safe_open
from typing import Dict
from .model_utils import determine_base_model

async def extract_lora_metadata(file_path: str) -> Dict:
    """Extract essential metadata from safetensors file"""
    try:
        with safe_open(file_path, framework="pt", device="cpu") as f:
            metadata = f.metadata()
            if metadata:
                # Only extract base_model from ss_base_model_version
                base_model = determine_base_model(metadata.get("ss_base_model_version"))
                return {"base_model": base_model}
    except Exception as e:
        print(f"Error reading metadata from {file_path}: {str(e)}")
    return {"base_model": "Unknown"} 