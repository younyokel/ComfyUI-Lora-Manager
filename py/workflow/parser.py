"""
Main workflow parser implementation for ComfyUI
"""
import json
import logging
from typing import Dict, List, Any, Optional, Union, Set
from .mappers import get_mapper, get_all_mappers, load_extensions, process_node
from .utils import (
    load_workflow, save_output, find_node_by_type,
    trace_model_path
)

logger = logging.getLogger(__name__)

class WorkflowParser:
    """Parser for ComfyUI workflows"""
    
    def __init__(self):
        """Initialize the parser with mappers"""
        self.processed_nodes: Set[str] = set()  # Track processed nodes to avoid cycles
        self.node_results_cache: Dict[str, Any] = {}  # Cache for processed node results
        
        # Load extensions
        load_extensions()
    
    def process_node(self, node_id: str, workflow: Dict) -> Any:
        """Process a single node and extract relevant information"""
        # Return cached result if available
        if node_id in self.node_results_cache:
            return self.node_results_cache[node_id]
            
        # Check if we're in a cycle
        if node_id in self.processed_nodes:
            return None
        
        # Mark this node as being processed (to detect cycles)
        self.processed_nodes.add(node_id)
        
        if node_id not in workflow:
            self.processed_nodes.remove(node_id)
            return None
        
        node_data = workflow[node_id]
        node_type = node_data.get("class_type")
        
        result = None
        if get_mapper(node_type):
            try:
                result = process_node(node_id, node_data, workflow, self)
                # Cache the result
                self.node_results_cache[node_id] = result
            except Exception as e:
                logger.error(f"Error processing node {node_id} of type {node_type}: {e}", exc_info=True)
                # Return a partial result or None depending on how we want to handle errors
                result = {}
        
        # Remove node from processed set to allow it to be processed again in a different context
        self.processed_nodes.remove(node_id)
        return result
    
    def find_primary_sampler_node(self, workflow: Dict) -> Optional[str]:
        """
        Find the primary sampler node in the workflow.
        
        Priority:
        1. First try to find a SamplerCustomAdvanced node
        2. If not found, look for KSampler nodes with denoise=1.0
        3. If still not found, use the first KSampler node
        
        Args:
            workflow: The workflow data as a dictionary
            
        Returns:
            The node ID of the primary sampler node, or None if not found
        """
        # First check for SamplerCustomAdvanced nodes
        sampler_advanced_nodes = []
        ksampler_nodes = []
        
        # Scan workflow for sampler nodes
        for node_id, node_data in workflow.items():
            node_type = node_data.get("class_type")
            
            if node_type == "SamplerCustomAdvanced":
                sampler_advanced_nodes.append(node_id)
            elif node_type == "KSampler":
                ksampler_nodes.append(node_id)
        
        # If we found SamplerCustomAdvanced nodes, return the first one
        if sampler_advanced_nodes:
            logger.debug(f"Found SamplerCustomAdvanced node: {sampler_advanced_nodes[0]}")
            return sampler_advanced_nodes[0]
        
        # If we have KSampler nodes, look for one with denoise=1.0
        if ksampler_nodes:
            for node_id in ksampler_nodes:
                node_data = workflow[node_id]
                inputs = node_data.get("inputs", {})
                denoise = inputs.get("denoise", 0)
                
                # Check if denoise is 1.0 (allowing for small floating point differences)
                if abs(float(denoise) - 1.0) < 0.001:
                    logger.debug(f"Found KSampler node with denoise=1.0: {node_id}")
                    return node_id
            
            # If no KSampler with denoise=1.0 found, use the first one
            logger.debug(f"No KSampler with denoise=1.0 found, using first KSampler: {ksampler_nodes[0]}")
            return ksampler_nodes[0]
        
        # No sampler nodes found
        logger.warning("No sampler nodes found in workflow")
        return None
    
    def collect_loras_from_model(self, model_input: List, workflow: Dict) -> str:
        """Collect loras information from the model node chain"""
        if not isinstance(model_input, list) or len(model_input) != 2:
            return ""
            
        model_node_id, _ = model_input
        # Convert node_id to string if it's an integer
        if isinstance(model_node_id, int):
            model_node_id = str(model_node_id)
            
        # Process the model node
        model_result = self.process_node(model_node_id, workflow)
        
        # If this is a Lora Loader node, return the loras text
        if model_result and isinstance(model_result, dict) and "loras" in model_result:
            return model_result["loras"]
            
        # If not a lora loader, check the node's inputs for a model connection
        node_data = workflow.get(model_node_id, {})
        inputs = node_data.get("inputs", {})
        
        # If this node has a model input, follow that path
        if "model" in inputs and isinstance(inputs["model"], list):
            return self.collect_loras_from_model(inputs["model"], workflow)
            
        return ""
    
    def parse_workflow(self, workflow_data: Union[str, Dict], output_path: Optional[str] = None) -> Dict:
        """
        Parse the workflow and extract generation parameters
        
        Args:
            workflow_data: The workflow data as a dictionary or a file path
            output_path: Optional path to save the output JSON
            
        Returns:
            Dictionary containing extracted parameters
        """
        # Load workflow from file if needed
        if isinstance(workflow_data, str):
            workflow = load_workflow(workflow_data)
        else:
            workflow = workflow_data
            
        # Reset the processed nodes tracker and cache
        self.processed_nodes = set()
        self.node_results_cache = {}
        
        # Find the primary sampler node
        sampler_node_id = self.find_primary_sampler_node(workflow)
        if not sampler_node_id:
            logger.warning("No suitable sampler node found in workflow")
            return {}
        
        # Process sampler node to extract parameters
        sampler_result = self.process_node(sampler_node_id, workflow)
        if not sampler_result:
            return {}
        
        # Return the sampler result directly - it's already in the format we need
        # This simplifies the structure and makes it easier to use in recipe_routes.py
        
        # Handle standard ComfyUI names vs our output format
        if "cfg" in sampler_result:
            sampler_result["cfg_scale"] = sampler_result.pop("cfg")
            
        # Add clip_skip = 1 to match reference output if not already present
        if "clip_skip" not in sampler_result:
            sampler_result["clip_skip"] = "1"
        
        # Ensure the prompt is a string and not a nested dictionary
        if "prompt" in sampler_result and isinstance(sampler_result["prompt"], dict):
            if "prompt" in sampler_result["prompt"]:
                sampler_result["prompt"] = sampler_result["prompt"]["prompt"]
        
        # Save the result if requested
        if output_path:
            save_output(sampler_result, output_path)
            
        return sampler_result


def parse_workflow(workflow_path: str, output_path: Optional[str] = None) -> Dict:
    """
    Parse a ComfyUI workflow file and extract generation parameters
    
    Args:
        workflow_path: Path to the workflow JSON file
        output_path: Optional path to save the output JSON
        
    Returns:
        Dictionary containing extracted parameters
    """
    parser = WorkflowParser()
    return parser.parse_workflow(workflow_path, output_path)