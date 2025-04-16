class NodeMetadataExtractor:
    """Base class for node-specific metadata extraction"""
    
    @staticmethod
    def extract(node_id, inputs, outputs, metadata):
        """Extract metadata from node inputs/outputs"""
        pass
        
    @staticmethod
    def update(node_id, outputs, metadata):
        """Update metadata with node outputs after execution"""
        pass
        
class GenericNodeExtractor(NodeMetadataExtractor):
    """Default extractor for nodes without specific handling"""
    @staticmethod
    def extract(node_id, inputs, outputs, metadata):
        pass
        
class CheckpointLoaderExtractor(NodeMetadataExtractor):
    @staticmethod
    def extract(node_id, inputs, outputs, metadata):
        if not inputs or "ckpt_name" not in inputs:
            return
            
        model_name = inputs.get("ckpt_name")
        if model_name:
            metadata["models"][node_id] = {
                "name": model_name,
                "type": "checkpoint",
                "node_id": node_id
            }
        
class CLIPTextEncodeExtractor(NodeMetadataExtractor):
    @staticmethod
    def extract(node_id, inputs, outputs, metadata):
        if not inputs or "text" not in inputs:
            return
            
        text = inputs.get("text", "")
        metadata["prompts"][node_id] = {
            "text": text,
            "node_id": node_id
        }
        
class SamplerExtractor(NodeMetadataExtractor):
    @staticmethod
    def extract(node_id, inputs, outputs, metadata):
        if not inputs:
            return
            
        sampling_params = {}
        for key in ["seed", "steps", "cfg", "sampler_name", "scheduler", "denoise"]:
            if key in inputs:
                sampling_params[key] = inputs[key]
                
        metadata["sampling"][node_id] = {
            "parameters": sampling_params,
            "node_id": node_id
        }
        
        # Extract latent image dimensions if available
        if "latent_image" in inputs and inputs["latent_image"] is not None:
            latent = inputs["latent_image"]
            if isinstance(latent, dict) and "samples" in latent:
                # Extract dimensions from latent tensor
                samples = latent["samples"]
                if hasattr(samples, "shape") and len(samples.shape) >= 3:
                    # Correct shape interpretation: [batch_size, channels, height/8, width/8]
                    # Multiply by 8 to get actual pixel dimensions
                    height = int(samples.shape[2] * 8)
                    width = int(samples.shape[3] * 8)
                    
                    if "size" not in metadata:
                        metadata["size"] = {}
                        
                    metadata["size"][node_id] = {
                        "width": width,
                        "height": height,
                        "node_id": node_id
                    }

class LoraLoaderExtractor(NodeMetadataExtractor):
    @staticmethod
    def extract(node_id, inputs, outputs, metadata):
        if not inputs or "lora_name" not in inputs:
            return
            
        lora_name = inputs.get("lora_name")
        strength_model = inputs.get("strength_model", 1.0)
        strength_clip = inputs.get("strength_clip", 1.0)
        
        metadata["loras"][node_id] = {
            "name": lora_name,
            "strength_model": strength_model,
            "strength_clip": strength_clip,
            "node_id": node_id
        }

class ImageSizeExtractor(NodeMetadataExtractor):
    @staticmethod
    def extract(node_id, inputs, outputs, metadata):
        if not inputs:
            return
        
        width = inputs.get("width", 512)
        height = inputs.get("height", 512)
        
        if "size" not in metadata:
            metadata["size"] = {}
            
        metadata["size"][node_id] = {
            "width": width,
            "height": height,
            "node_id": node_id
        }

class LoraLoaderManagerExtractor(NodeMetadataExtractor):
    @staticmethod
    def extract(node_id, inputs, outputs, metadata):
        if not inputs:
            return
            
        # Handle LoraManager nodes which might store loras differently
        if "loras" in inputs:
            loras = inputs.get("loras", [])
            if isinstance(loras, list):
                active_loras = []
                # Filter for active loras (may be a list of dicts with 'active' flag)
                for lora in loras:
                    if isinstance(lora, dict) and lora.get("active", True) and not lora.get("_isDummy", False):
                        active_loras.append({
                            "name": lora.get("name", ""),
                            "strength": lora.get("strength", 1.0)
                        })
                
                if active_loras:
                    metadata["loras"][node_id] = {
                        "lora_list": active_loras,
                        "node_id": node_id
                    }
        
        # If there's a direct text field with lora definitions
        if "text" in inputs:
            text = inputs.get("text", "")
            if text and "<lora:" in text:
                metadata["loras"][node_id] = {
                    "raw_text": text,
                    "node_id": node_id
                }
        
# Registry of node-specific extractors
NODE_EXTRACTORS = {
    "CheckpointLoaderSimple": CheckpointLoaderExtractor,
    "CLIPTextEncode": CLIPTextEncodeExtractor,
    "KSampler": SamplerExtractor,
    "LoraLoader": LoraLoaderExtractor,
    "EmptyLatentImage": ImageSizeExtractor,
    "Lora Loader (LoraManager)": LoraLoaderManagerExtractor,
    "SamplerCustomAdvanced": SamplerExtractor,  # Add SamplerCustomAdvanced
    "UNETLoader": CheckpointLoaderExtractor,    # Add UNETLoader
    # Add other nodes as needed
}
