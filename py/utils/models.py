from dataclasses import dataclass, asdict
from typing import Dict, Optional, List
from datetime import datetime
import os
from .model_utils import determine_base_model

@dataclass
class BaseModelMetadata:
    """Base class for all model metadata structures"""
    file_name: str              # The filename without extension
    model_name: str             # The model's name defined by the creator
    file_path: str              # Full path to the model file
    size: int                   # File size in bytes
    modified: float             # Last modified timestamp
    sha256: str                 # SHA256 hash of the file
    base_model: str             # Base model type (SD1.5/SD2.1/SDXL/etc.)
    preview_url: str            # Preview image URL
    preview_nsfw_level: int = 0 # NSFW level of the preview image
    notes: str = ""             # Additional notes
    from_civitai: bool = True   # Whether from Civitai
    civitai: Optional[Dict] = None  # Civitai API data if available
    tags: List[str] = None      # Model tags
    modelDescription: str = ""  # Full model description
    civitai_deleted: bool = False  # Whether deleted from Civitai
    favorite: bool = False      # Whether the model is a favorite
    exclude: bool = False       # Whether to exclude this model from the cache

    def __post_init__(self):
        # Initialize empty lists to avoid mutable default parameter issue
        if self.tags is None:
            self.tags = []

    @classmethod
    def from_dict(cls, data: Dict) -> 'BaseModelMetadata':
        """Create instance from dictionary"""
        data_copy = data.copy()
        return cls(**data_copy)

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
class LoraMetadata(BaseModelMetadata):
    """Represents the metadata structure for a Lora model"""
    usage_tips: str = "{}"      # Usage tips for the model, json string

    @classmethod
    def from_civitai_info(cls, version_info: Dict, file_info: Dict, save_path: str) -> 'LoraMetadata':
        """Create LoraMetadata instance from Civitai version info"""
        file_name = file_info['name']
        base_model = determine_base_model(version_info.get('baseModel', ''))
        
        # Extract tags and description if available
        tags = []
        description = ""
        if 'model' in version_info:
            if 'tags' in version_info['model']:
                tags = version_info['model']['tags']
            if 'description' in version_info['model']:
                description = version_info['model']['description']
        
        return cls(
            file_name=os.path.splitext(file_name)[0],
            model_name=version_info.get('model').get('name', os.path.splitext(file_name)[0]),
            file_path=save_path.replace(os.sep, '/'),
            size=file_info.get('sizeKB', 0) * 1024,
            modified=datetime.now().timestamp(),
            sha256=file_info['hashes'].get('SHA256', '').lower(),
            base_model=base_model,
            preview_url=None,  # Will be updated after preview download
            preview_nsfw_level=0, # Will be updated after preview download
            from_civitai=True,
            civitai=version_info,
            tags=tags,
            modelDescription=description
        )

@dataclass
class CheckpointMetadata(BaseModelMetadata):
    """Represents the metadata structure for a Checkpoint model"""
    model_type: str = "checkpoint"  # Model type (checkpoint, inpainting, etc.)

    @classmethod
    def from_civitai_info(cls, version_info: Dict, file_info: Dict, save_path: str) -> 'CheckpointMetadata':
        """Create CheckpointMetadata instance from Civitai version info"""
        file_name = file_info['name']
        base_model = determine_base_model(version_info.get('baseModel', ''))
        model_type = version_info.get('type', 'checkpoint')
        
        # Extract tags and description if available
        tags = []
        description = ""
        if 'model' in version_info:
            if 'tags' in version_info['model']:
                tags = version_info['model']['tags']
            if 'description' in version_info['model']:
                description = version_info['model']['description']
        
        return cls(
            file_name=os.path.splitext(file_name)[0],
            model_name=version_info.get('model').get('name', os.path.splitext(file_name)[0]),
            file_path=save_path.replace(os.sep, '/'),
            size=file_info.get('sizeKB', 0) * 1024,
            modified=datetime.now().timestamp(),
            sha256=file_info['hashes'].get('SHA256', '').lower(),
            base_model=base_model,
            preview_url=None,  # Will be updated after preview download
            preview_nsfw_level=0,
            from_civitai=True,
            civitai=version_info,
            model_type=model_type,
            tags=tags,
            modelDescription=description
        )

