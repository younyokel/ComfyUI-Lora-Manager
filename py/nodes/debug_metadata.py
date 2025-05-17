import logging
from ..metadata_collector.metadata_processor import MetadataProcessor

logger = logging.getLogger(__name__)

class DebugMetadata:
    NAME = "Debug Metadata (LoraManager)"
    CATEGORY = "Lora Manager/utils"
    DESCRIPTION = "Debug node to verify metadata_processor functionality"
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
            },
            "hidden": {
                "id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("metadata_json",)
    FUNCTION = "process_metadata"

    def process_metadata(self, images, id):
        try:
            # Get the current execution context's metadata
            from ..metadata_collector import get_metadata
            metadata = get_metadata()
            
            # Use the MetadataProcessor to convert it to JSON string
            metadata_json = MetadataProcessor.to_json(metadata, id)
            
            return (metadata_json,)
        except Exception as e:
            logger.error(f"Error processing metadata: {e}")
            return ("{}",)  # Return empty JSON object in case of error
