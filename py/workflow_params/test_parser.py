#!/usr/bin/env python3
"""Test script for the workflow parser"""

import os
import json
import logging
from pathlib import Path

from .workflow_parser import WorkflowParser

# Configure logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_parse_example():
    """Test parsing the example prompt.json file and compare with expected output"""
    # Get the project root directory
    project_root = Path(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    
    # Path to the example files
    prompt_path = project_root / "refs" / "prompt.json"
    output_path = project_root / "refs" / "output.json"
    
    # Ensure the files exist
    if not prompt_path.exists():
        logger.error(f"Example prompt file not found: {prompt_path}")
        return False
    
    if not output_path.exists():
        logger.error(f"Example output file not found: {output_path}")
        return False
    
    # Load the files
    try:
        with open(prompt_path, 'r', encoding='utf-8') as f:
            prompt_json = f.read()
        
        with open(output_path, 'r', encoding='utf-8') as f:
            expected_output = json.load(f)
    except Exception as e:
        logger.error(f"Failed to read example files: {e}")
        return False
    
    # Parse the workflow
    parser = WorkflowParser()
    result = parser.parse_workflow(prompt_json)
    
    # Display the result
    logger.info("Parsed workflow:")
    logger.info(json.dumps(result, indent=4))
    
    # Compare with expected output
    logger.info("Expected output:")
    logger.info(json.dumps(expected_output, indent=4))
    
    # Basic validation
    if "loras" not in result:
        logger.error("Missing 'loras' field in result")
        return False
    
    if "gen_params" not in result:
        logger.error("Missing 'gen_params' field in result")
        return False
    
    required_params = [
        "prompt", "negative_prompt", "steps", "sampler", 
        "cfg_scale", "seed", "size", "clip_skip"
    ]
    
    for param in required_params:
        if param not in result["gen_params"]:
            logger.error(f"Missing '{param}' in gen_params")
            return False
    
    logger.info("Test completed successfully!")
    return True

if __name__ == "__main__":
    test_parse_example() 