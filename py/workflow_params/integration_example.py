#!/usr/bin/env python3
"""Example of integrating the workflow parser with other modules"""

import os
import json
import sys
import logging
import re
from pathlib import Path

# Add the parent directory to the Python path if needed
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from py.workflow_params import WorkflowParser

# Configure logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def extract_and_save_workflow_params(workflow_path, output_path=None):
    """
    Extract parameters from a workflow and save them to a file
    
    Args:
        workflow_path: Path to the workflow JSON file
        output_path: Optional path to save the extracted parameters
                     If None, prints the parameters to stdout
    
    Returns:
        The extracted parameters
    """
    # Ensure the workflow file exists
    if not os.path.exists(workflow_path):
        logger.error(f"Workflow file not found: {workflow_path}")
        return None
    
    # Read the workflow file
    try:
        with open(workflow_path, 'r', encoding='utf-8') as f:
            workflow_json = f.read()
    except Exception as e:
        logger.error(f"Failed to read workflow file: {e}")
        return None
    
    # Parse the workflow
    try:
        parser = WorkflowParser()
        params = parser.parse_workflow(workflow_json)
    except Exception as e:
        logger.error(f"Failed to parse workflow: {e}")
        return None
    
    # Format the output
    output_json = json.dumps(params, indent=4)
    
    # Save or print the output
    if output_path:
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(output_json)
            logger.info(f"Parameters saved to {output_path}")
        except Exception as e:
            logger.error(f"Failed to write output file: {e}")
    else:
        print(output_json)
    
    return params

def get_workflow_loras(workflow_path):
    """
    Extract just the loras from a workflow
    
    Args:
        workflow_path: Path to the workflow JSON file
    
    Returns:
        List of lora names used in the workflow
    """
    params = extract_and_save_workflow_params(workflow_path)
    if not params or "loras" not in params:
        return []
    
    # Extract lora names from the lora strings
    lora_text = params["loras"]
    lora_names = []
    
    # Parse the lora text format <lora:name:strength>
    lora_pattern = r'<lora:([^:]+):[^>]+>'
    matches = re.findall(lora_pattern, lora_text)
    
    return matches

def main():
    """Main example function"""
    # Check for command line arguments
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <workflow_json_file> [output_file]")
        return 1
    
    workflow_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    # Example 1: Extract and save all parameters
    params = extract_and_save_workflow_params(workflow_path, output_path)
    if not params:
        return 1
    
    # Example 2: Get just the loras
    loras = get_workflow_loras(workflow_path)
    print(f"Loras used in the workflow: {loras}")
    
    return 0

if __name__ == "__main__":
    sys.exit(main()) 