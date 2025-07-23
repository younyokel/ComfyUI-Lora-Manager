import logging
from typing import List

from ..utils.models import CheckpointMetadata
from ..config import config
from .model_scanner import ModelScanner
from .model_hash_index import ModelHashIndex

logger = logging.getLogger(__name__)

class CheckpointScanner(ModelScanner):
    """Service for scanning and managing checkpoint files"""
    
    def __init__(self):
        # Define supported file extensions
        file_extensions = {'.safetensors', '.ckpt', '.pt', '.pth', '.sft', '.gguf'}
        super().__init__(
            model_type="checkpoint",
            model_class=CheckpointMetadata,
            file_extensions=file_extensions,
            hash_index=ModelHashIndex()
        )

    def get_model_roots(self) -> List[str]:
        """Get checkpoint root directories"""
        return config.base_models_roots

    # Checkpoint-specific hash index functionality
    def has_checkpoint_hash(self, sha256: str) -> bool:
        """Check if a checkpoint with given hash exists"""
        return self.has_hash(sha256)
        
    def get_checkpoint_path_by_hash(self, sha256: str) -> str:
        """Get file path for a checkpoint by its hash"""
        return self.get_path_by_hash(sha256)
        
    def get_checkpoint_hash_by_path(self, file_path: str) -> str:
        """Get hash for a checkpoint by its file path"""
        return self.get_hash_by_path(file_path)