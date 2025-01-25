from dataclasses import dataclass, asdict
from typing import Dict, Optional
from datetime import datetime

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
    civitai: Optional[Dict] = None  # Civitai API data if available

    @classmethod
    def from_dict(cls, data: Dict) -> 'LoraMetadata':
        """Create LoraMetadata instance from dictionary"""
        # Create a copy of the data to avoid modifying the input
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