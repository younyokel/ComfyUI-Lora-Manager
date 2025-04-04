from dataclasses import dataclass, asdict
from typing import Dict, Optional, List
from datetime import datetime
import os
from .model_utils import determine_base_model

@dataclass
class LoraMetadata:
    """Represents the metadata structure for a Lora model"""
    file_name: str              # The filename without extension of the lora
    model_name: str             # The lora's name defined by the creator, initially same as file_name
    file_path: str              # Full path to the safetensors file
    size: int                   # File size in bytes
    modified: float             # Last modified timestamp
    sha256: str                 # SHA256 hash of the file
    base_model: str             # Base model (SD1.5/SD2.1/SDXL/etc.)
    preview_url: str            # Preview image URL
    preview_nsfw_level: int = 0 # NSFW level of the preview image
    usage_tips: str = "{}"      # Usage tips for the model, json string
    notes: str = ""             # Additional notes
    from_civitai: bool = True   # Whether the lora is from Civitai
    civitai: Optional[Dict] = None  # Civitai API data if available
    tags: List[str] = None      # Model tags
    modelDescription: str = ""  # Full model description

    def __post_init__(self):
        # Initialize empty lists to avoid mutable default parameter issue
        if self.tags is None:
            self.tags = []

    @classmethod
    def from_dict(cls, data: Dict) -> 'LoraMetadata':
        """Create LoraMetadata instance from dictionary"""
        # Create a copy of the data to avoid modifying the input
        data_copy = data.copy()
        return cls(**data_copy)

    @classmethod
    def from_civitai_info(cls, version_info: Dict, file_info: Dict, save_path: str) -> 'LoraMetadata':
        """Create LoraMetadata instance from Civitai version info"""
        file_name = file_info['name']
        base_model = determine_base_model(version_info.get('baseModel', ''))
        
        return cls(
            file_name=os.path.splitext(file_name)[0],
            model_name=version_info.get('model').get('name', os.path.splitext(file_name)[0]),
            file_path=save_path.replace(os.sep, '/'),
            size=file_info.get('sizeKB', 0) * 1024,
            modified=datetime.now().timestamp(),
            sha256=file_info['hashes'].get('SHA256', '').lower(),
            base_model=base_model,
            preview_url=None,  # Will be updated after preview download
            preview_nsfw_level=0, # Will be updated after preview download, it is decided by the nsfw level of the preview image
            from_civitai=True,
            civitai=version_info
        )

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)

    @property
    def modified_datetime(self) -> datetime:
        """Convert modified timestamp to datetime object"""
        return datetime.fromtimestamp(self.modified)

    def update_civitai_info(self, civitai_data: Dict) -> None:
        """Update Civitai information"""
        self.civitai = civitai_data

    def update_file_info(self, file_path: str) -> None:
        """Update metadata with actual file information"""
        if os.path.exists(file_path):
            self.size = os.path.getsize(file_path)
            self.modified = os.path.getmtime(file_path)
            self.file_path = file_path.replace(os.sep, '/')

@dataclass
class CheckpointMetadata:
    """Represents the metadata structure for a Checkpoint model"""
    file_name: str              # The filename without extension
    model_name: str             # The checkpoint's name defined by the creator
    file_path: str              # Full path to the model file
    size: int                   # File size in bytes
    modified: float             # Last modified timestamp
    sha256: str                 # SHA256 hash of the file
    base_model: str             # Base model type (SD1.5/SD2.1/SDXL/etc.)
    preview_url: str            # Preview image URL
    preview_nsfw_level: int = 0 # NSFW level of the preview image
    model_type: str = "checkpoint"  # Model type (checkpoint, inpainting, etc.)
    notes: str = ""             # Additional notes
    from_civitai: bool = True   # Whether from Civitai
    civitai: Optional[Dict] = None  # Civitai API data if available
    tags: List[str] = None      # Model tags
    modelDescription: str = ""  # Full model description
    
    # Additional checkpoint-specific fields
    resolution: Optional[str] = None  # Native resolution (e.g., 512x512, 1024x1024)
    vae_included: bool = False       # Whether VAE is included in the checkpoint
    architecture: str = ""           # Model architecture (if known)
    
    def __post_init__(self):
        if self.tags is None:
            self.tags = []

