"""
Main entry point for the workflow parser module
"""
import os
import sys
import logging
from typing import Dict, Optional, Union

# Add the parent directory to sys.path to enable imports
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
sys.path.insert(0, os.path.dirname(SCRIPT_DIR))

from .parser import parse_workflow

logger = logging.getLogger(__name__)

def parse_comfyui_workflow(
    workflow_path: str, 
    output_path: Optional[str] = None
) -> Dict:
    """
    Parse a ComfyUI workflow file and extract generation parameters
    
    Args:
        workflow_path: Path to the workflow JSON file
        output_path: Optional path to save the output JSON
        
    Returns:
        Dictionary containing extracted parameters
    """
    return parse_workflow(workflow_path, output_path)

if __name__ == "__main__":
    # If run directly, use the CLI
    from .cli import main
    main() 