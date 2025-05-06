"""Factory for creating recipe metadata parsers."""

import logging
from .parsers import (
    RecipeFormatParser,
    ComfyMetadataParser,
    MetaFormatParser,
    AutomaticMetadataParser
)
from .base import RecipeMetadataParser

logger = logging.getLogger(__name__)

class RecipeParserFactory:
    """Factory for creating recipe metadata parsers"""
    
    @staticmethod
    def create_parser(user_comment: str) -> RecipeMetadataParser:
        """
        Create appropriate parser based on the user comment content
        
        Args:
            user_comment: The EXIF UserComment string from the image
            
        Returns:
            Appropriate RecipeMetadataParser implementation
        """
        # Try ComfyMetadataParser first since it requires valid JSON
        try:
            if ComfyMetadataParser().is_metadata_matching(user_comment):
                return ComfyMetadataParser()
        except Exception:
            # If JSON parsing fails, move on to other parsers
            pass
            
        if RecipeFormatParser().is_metadata_matching(user_comment):
            return RecipeFormatParser()
        elif AutomaticMetadataParser().is_metadata_matching(user_comment):
            return AutomaticMetadataParser()
        elif MetaFormatParser().is_metadata_matching(user_comment):
            return MetaFormatParser()
        else:
            return None
