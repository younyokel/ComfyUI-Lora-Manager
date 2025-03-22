"""
Command-line interface for the ComfyUI workflow parser
"""
import argparse
import json
import os
import logging
import sys
from .parser import parse_workflow

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

def main():
    """Entry point for the CLI"""
    parser = argparse.ArgumentParser(description='Parse ComfyUI workflow files')
    parser.add_argument('input', help='Input workflow JSON file path')
    parser.add_argument('-o', '--output', help='Output JSON file path')
    parser.add_argument('-p', '--pretty', action='store_true', help='Pretty print JSON output')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    
    args = parser.parse_args()
    
    # Set logging level
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Validate input file
    if not os.path.isfile(args.input):
        logger.error(f"Input file not found: {args.input}")
        sys.exit(1)
    
    # Parse workflow
    try:
        result = parse_workflow(args.input, args.output)
        
        # Print result to console if output file not specified
        if not args.output:
            if args.pretty:
                print(json.dumps(result, indent=4))
            else:
                print(json.dumps(result))
        else:
            logger.info(f"Output saved to: {args.output}")
            
    except Exception as e:
        logger.error(f"Error parsing workflow: {e}")
        if args.debug:
            import traceback
            traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main() 