#!/usr/bin/env python3
"""Command-line interface for testing the workflow parser"""

import argparse
import json
import sys
from pathlib import Path
import logging

from .workflow_parser import WorkflowParser

# Configure logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def main():
    """Main entry point for the command-line interface"""
    parser = argparse.ArgumentParser(description="Parse ComfyUI workflow JSON files")
    parser.add_argument("input_file", type=str, help="Path to input workflow JSON file")
    parser.add_argument("-o", "--output", type=str, help="Path to output JSON file (defaults to stdout)")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose output")
    
    args = parser.parse_args()
    
    # Set log level based on verbosity
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Read input file
    input_path = Path(args.input_file)
    if not input_path.exists():
        logger.error(f"Input file {input_path} does not exist")
        return 1
    
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            workflow_json = f.read()
    except Exception as e:
        logger.error(f"Failed to read input file: {e}")
        return 1
    
    # Parse workflow
    try:
        workflow_parser = WorkflowParser()
        result = workflow_parser.parse_workflow(workflow_json)
    except Exception as e:
        logger.error(f"Failed to parse workflow: {e}")
        return 1
    
    # Output result
    output_json = json.dumps(result, indent=4)
    
    if args.output:
        try:
            with open(args.output, 'w', encoding='utf-8') as f:
                f.write(output_json)
            logger.info(f"Output written to {args.output}")
        except Exception as e:
            logger.error(f"Failed to write output file: {e}")
            return 1
    else:
        print(output_json)
    
    return 0

if __name__ == "__main__":
    sys.exit(main()) 