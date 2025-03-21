"""Module for dynamically loading node processor extensions"""

import os
import importlib
import importlib.util
import logging
import inspect
from typing import Dict, Any, List, Set, Type
from pathlib import Path

from .node_processors import NodeProcessor, NODE_PROCESSORS

logger = logging.getLogger(__name__)

class ExtensionManager:
    """Manager for dynamically loading node processor extensions"""
    
    def __init__(self, extensions_dir: str = None):
        """
        Initialize the extension manager
        
        Args:
            extensions_dir: Optional path to a directory containing extensions
                            If None, uses the default extensions directory
        """
        if extensions_dir is None:
            # Use the default extensions directory
            module_dir = os.path.dirname(os.path.abspath(__file__))
            self.extensions_dir = os.path.join(module_dir, "extensions")
        else:
            self.extensions_dir = extensions_dir
            
        self.loaded_extensions: Dict[str, Any] = {}
        
    def discover_extensions(self) -> List[str]:
        """
        Discover available extensions in the extensions directory
        
        Returns:
            List of extension file paths that can be loaded
        """
        if not os.path.exists(self.extensions_dir):
            logger.warning(f"Extensions directory not found: {self.extensions_dir}")
            return []
            
        extension_files = []
        
        # Walk through the extensions directory
        for root, _, files in os.walk(self.extensions_dir):
            for filename in files:
                # Only consider Python files
                if filename.endswith('.py') and not filename.startswith('__'):
                    filepath = os.path.join(root, filename)
                    extension_files.append(filepath)
        
        return extension_files
    
    def load_extension(self, extension_path: str) -> bool:
        """
        Load a single extension from a file path
        
        Args:
            extension_path: Path to the extension file
            
        Returns:
            True if loaded successfully, False otherwise
        """
        if extension_path in self.loaded_extensions:
            logger.debug(f"Extension already loaded: {extension_path}")
            return True
            
        try:
            # Get module name from file path
            module_name = os.path.basename(extension_path).replace(".py", "")
            
            # Load the module
            spec = importlib.util.spec_from_file_location(module_name, extension_path)
            if spec is None or spec.loader is None:
                logger.error(f"Failed to load extension spec: {extension_path}")
                return False
                
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            
            # Find NodeProcessor subclasses in the module
            processor_classes = []
            for _, obj in inspect.getmembers(module):
                if (inspect.isclass(obj) and 
                    issubclass(obj, NodeProcessor) and 
                    obj is not NodeProcessor):
                    processor_classes.append(obj)
            
            if not processor_classes:
                logger.warning(f"No NodeProcessor subclasses found in {extension_path}")
                return False
                
            # Register each processor class
            for cls in processor_classes:
                cls.register()
                
            # Store the loaded module
            self.loaded_extensions[extension_path] = module
            logger.info(f"Loaded extension: {extension_path} with {len(processor_classes)} processors")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to load extension {extension_path}: {e}")
            return False
    
    def load_all_extensions(self) -> Dict[str, bool]:
        """
        Load all available extensions
        
        Returns:
            Dict mapping extension paths to success/failure status
        """
        extension_files = self.discover_extensions()
        results = {}
        
        for extension_path in extension_files:
            results[extension_path] = self.load_extension(extension_path)
            
        return results
    
    def get_loaded_processor_types(self) -> Set[str]:
        """
        Get the set of all loaded processor types
        
        Returns:
            Set of class_type names for all loaded processors
        """
        return set(NODE_PROCESSORS.keys())
        
    def get_loaded_extension_count(self) -> int:
        """
        Get the number of loaded extensions
        
        Returns:
            Number of loaded extensions
        """
        return len(self.loaded_extensions)


# Create a singleton instance
_extension_manager = None

def get_extension_manager(extensions_dir: str = None) -> ExtensionManager:
    """
    Get the singleton ExtensionManager instance
    
    Args:
        extensions_dir: Optional path to extensions directory
        
    Returns:
        ExtensionManager instance
    """
    global _extension_manager
    
    if _extension_manager is None:
        _extension_manager = ExtensionManager(extensions_dir)
        
    return _extension_manager 