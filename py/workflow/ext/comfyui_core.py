"""
ComfyUI Core nodes mappers extension for workflow parsing
"""
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

# =============================================================================
# Transform Functions
# =============================================================================

def transform_random_noise(inputs: Dict) -> Dict:
    """Transform function for RandomNoise node"""
    return {"seed": str(inputs.get("noise_seed", ""))}

def transform_ksampler_select(inputs: Dict) -> Dict:
    """Transform function for KSamplerSelect node"""
    return {"sampler": inputs.get("sampler_name", "")}

def transform_basic_scheduler(inputs: Dict) -> Dict:
    """Transform function for BasicScheduler node"""
    result = {
        "scheduler": inputs.get("scheduler", ""),
        "denoise": str(inputs.get("denoise", "1.0"))
    }
    
    # Get steps from inputs or steps input
    if "steps" in inputs:
        if isinstance(inputs["steps"], str):
            result["steps"] = inputs["steps"]
        elif isinstance(inputs["steps"], dict) and "value" in inputs["steps"]:
            result["steps"] = str(inputs["steps"]["value"])
        else:
            result["steps"] = str(inputs["steps"])
    
    return result

def transform_basic_guider(inputs: Dict) -> Dict:
    """Transform function for BasicGuider node"""
    result = {}
    
    # Process conditioning
    if "conditioning" in inputs:
        if isinstance(inputs["conditioning"], str):
            result["prompt"] = inputs["conditioning"]
        elif isinstance(inputs["conditioning"], dict):
            result["conditioning"] = inputs["conditioning"]
    
    # Get model information if needed
    if "model" in inputs and isinstance(inputs["model"], dict):
        result["model"] = inputs["model"]
    
    return result

def transform_model_sampling_flux(inputs: Dict) -> Dict:
    """Transform function for ModelSamplingFlux - mostly a pass-through node"""
    # This node is primarily used for routing, so we mostly pass through values
    
    return inputs["model"]

def transform_sampler_custom_advanced(inputs: Dict) -> Dict:
    """Transform function for SamplerCustomAdvanced node"""
    result = {}
    
    # Extract seed from noise
    if "noise" in inputs and isinstance(inputs["noise"], dict):
        result["seed"] = str(inputs["noise"].get("seed", ""))
    
    # Extract sampler info
    if "sampler" in inputs and isinstance(inputs["sampler"], dict):
        sampler = inputs["sampler"].get("sampler", "")
        if sampler:
            result["sampler"] = sampler
    
    # Extract scheduler, steps, denoise from sigmas
    if "sigmas" in inputs and isinstance(inputs["sigmas"], dict):
        sigmas = inputs["sigmas"]
        result["scheduler"] = sigmas.get("scheduler", "")
        result["steps"] = str(sigmas.get("steps", ""))
        result["denoise"] = str(sigmas.get("denoise", "1.0"))
    
    # Extract prompt and guidance from guider
    if "guider" in inputs and isinstance(inputs["guider"], dict):
        guider = inputs["guider"]
        
        # Get prompt from conditioning
        if "conditioning" in guider and isinstance(guider["conditioning"], str):
            result["prompt"] = guider["conditioning"]
        elif "conditioning" in guider and isinstance(guider["conditioning"], dict):
            result["guidance"] = guider["conditioning"].get("guidance", "")
            result["prompt"] = guider["conditioning"].get("prompt", "")

        if "model" in guider and isinstance(guider["model"], dict):
            result["checkpoint"] = guider["model"].get("checkpoint", "")
            result["loras"] = guider["model"].get("loras", "")
            result["clip_skip"] = str(int(guider["model"].get("clip_skip", "-1")) * -1)
    
    # Extract dimensions from latent_image
    if "latent_image" in inputs and isinstance(inputs["latent_image"], dict):
        latent = inputs["latent_image"]
        width = latent.get("width", 0)
        height = latent.get("height", 0)
        if width and height:
            result["width"] = width
            result["height"] = height
            result["size"] = f"{width}x{height}"
    
    return result

def transform_ksampler(inputs: Dict) -> Dict:
    """Transform function for KSampler nodes"""
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

    # Add guidance if present
    if "guidance" in inputs:
        result["guidance"] = str(inputs.get("guidance", ""))

    # Add model if present
    if "model" in inputs:
        result["checkpoint"] = inputs.get("model", {}).get("checkpoint", "")
        result["loras"] = inputs.get("model", {}).get("loras", "")
        result["clip_skip"] = str(inputs.get("model", {}).get("clip_skip", -1) * -1)
        
    return result

def transform_empty_latent(inputs: Dict) -> Dict:
    """Transform function for EmptyLatentImage nodes"""
    width = inputs.get("width", 0)
    height = inputs.get("height", 0)
    return {"width": width, "height": height, "size": f"{width}x{height}"}

def transform_clip_text(inputs: Dict) -> Any:
    """Transform function for CLIPTextEncode nodes"""
    return inputs.get("text", "")

def transform_flux_guidance(inputs: Dict) -> Dict:
    """Transform function for FluxGuidance nodes"""
    result = {}
    
    if "guidance" in inputs:
        result["guidance"] = inputs["guidance"]
    
    if "conditioning" in inputs:
        conditioning = inputs["conditioning"]
        if isinstance(conditioning, str):
            result["prompt"] = conditioning
        else:
            result["prompt"] = "Unknown prompt"
    
    return result

def transform_unet_loader(inputs: Dict) -> Dict:
    """Transform function for UNETLoader node"""
    unet_name = inputs.get("unet_name", "")
    return {"checkpoint": unet_name} if unet_name else {}

def transform_checkpoint_loader(inputs: Dict) -> Dict:
    """Transform function for CheckpointLoaderSimple node"""
    ckpt_name = inputs.get("ckpt_name", "")
    return {"checkpoint": ckpt_name} if ckpt_name else {}

def transform_latent_upscale_by(inputs: Dict) -> Dict:
    """Transform function for LatentUpscaleBy node"""
    result = {}
    
    width = inputs["samples"].get("width", 0) * inputs["scale_by"]
    height = inputs["samples"].get("height", 0) * inputs["scale_by"]
    result["width"] = width
    result["height"] = height
    result["size"] = f"{width}x{height}"
    
    return result

def transform_clip_set_last_layer(inputs: Dict) -> Dict:
    """Transform function for CLIPSetLastLayer node"""
    result = {}
    
    if "stop_at_clip_layer" in inputs:
        result["clip_skip"] = inputs["stop_at_clip_layer"]
    
    return result

# =============================================================================
# Node Mapper Definitions
# =============================================================================

# Define the mappers for ComfyUI core nodes not in main mapper
NODE_MAPPERS_EXT = {
    # KSamplers
    "SamplerCustomAdvanced": {
        "inputs_to_track": ["noise", "guider", "sampler", "sigmas", "latent_image"],
        "transform_func": transform_sampler_custom_advanced
    },
    "KSampler": {
        "inputs_to_track": [
            "seed", "steps", "cfg", "sampler_name", "scheduler", 
            "denoise", "positive", "negative", "latent_image",
            "model", "clip_skip"
        ],
        "transform_func": transform_ksampler
    },
    # ComfyUI core nodes
    "EmptyLatentImage": {
        "inputs_to_track": ["width", "height", "batch_size"],
        "transform_func": transform_empty_latent
    },
    "EmptySD3LatentImage": {
        "inputs_to_track": ["width", "height", "batch_size"],
        "transform_func": transform_empty_latent
    },
    "CLIPTextEncode": {
        "inputs_to_track": ["text", "clip"],
        "transform_func": transform_clip_text
    },
    "FluxGuidance": {
        "inputs_to_track": ["guidance", "conditioning"],
        "transform_func": transform_flux_guidance
    },
    "RandomNoise": {
        "inputs_to_track": ["noise_seed"],
        "transform_func": transform_random_noise
    },
    "KSamplerSelect": {
        "inputs_to_track": ["sampler_name"],
        "transform_func": transform_ksampler_select
    },
    "BasicScheduler": {
        "inputs_to_track": ["scheduler", "steps", "denoise", "model"],
        "transform_func": transform_basic_scheduler
    },
    "BasicGuider": {
        "inputs_to_track": ["model", "conditioning"],
        "transform_func": transform_basic_guider
    },
    "ModelSamplingFlux": {
        "inputs_to_track": ["max_shift", "base_shift", "width", "height", "model"],
        "transform_func": transform_model_sampling_flux
    },
    "UNETLoader": {
        "inputs_to_track": ["unet_name"],
        "transform_func": transform_unet_loader
    },
    "CheckpointLoaderSimple": {
        "inputs_to_track": ["ckpt_name"],
        "transform_func": transform_checkpoint_loader
    },
    "LatentUpscale": {
        "inputs_to_track": ["width", "height"],
        "transform_func": transform_empty_latent
    },
    "LatentUpscaleBy": {
        "inputs_to_track": ["samples", "scale_by"],
        "transform_func": transform_latent_upscale_by
    },
    "CLIPSetLastLayer": {
        "inputs_to_track": ["clip", "stop_at_clip_layer"],
        "transform_func": transform_clip_set_last_layer
    }
} 