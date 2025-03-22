"""
Test script for the ComfyUI workflow parser
"""
import os
import json
import logging
from .parser import parse_workflow

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# Configure paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
REFS_DIR = os.path.join(ROOT_DIR, 'refs')
OUTPUT_DIR = os.path.join(ROOT_DIR, 'output')

def test_parse_flux_workflow():
    """Test parsing the flux example workflow"""
    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Define input and output paths
    input_path = os.path.join(REFS_DIR, 'flux_prompt.json')
    output_path = os.path.join(OUTPUT_DIR, 'parsed_flux_output.json')
    
    # Parse workflow
    logger.info(f"Parsing workflow: {input_path}")
    result = parse_workflow(input_path, output_path)
    
    # Print result summary
    logger.info(f"Output saved to: {output_path}")
    logger.info(f"Parsing completed. Result summary:")
    logger.info(f"  LoRAs: {result.get('loras', '')}")
    
    gen_params = result.get('gen_params', {})
    logger.info(f"  Prompt: {gen_params.get('prompt', '')[:50]}...")
    logger.info(f"  Steps: {gen_params.get('steps', '')}")
    logger.info(f"  Sampler: {gen_params.get('sampler', '')}")
    logger.info(f"  Size: {gen_params.get('size', '')}")
    
    # Compare with reference output
    ref_output_path = os.path.join(REFS_DIR, 'flux_output.json')
    try:
        with open(ref_output_path, 'r') as f:
            ref_output = json.load(f)
            
        # Simple validation
        loras_match = result.get('loras', '') == ref_output.get('loras', '')
        prompt_match = gen_params.get('prompt', '') == ref_output.get('gen_params', {}).get('prompt', '')
        
        logger.info(f"Validation against reference:")
        logger.info(f"  LoRAs match: {loras_match}")
        logger.info(f"  Prompt match: {prompt_match}")
    except Exception as e:
        logger.warning(f"Failed to compare with reference output: {e}")

if __name__ == "__main__":
    test_parse_flux_workflow() 