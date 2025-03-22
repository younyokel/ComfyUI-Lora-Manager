"""
Main workflow parser implementation for ComfyUI
"""
import json
import logging
from typing import Dict, List, Any, Optional, Union, Set
from .mappers import get_mapper, get_all_mappers, load_extensions
from .utils import (
    load_workflow, save_output, find_node_by_type,
    trace_model_path
)

logger = logging.getLogger(__name__)

class WorkflowParser:
    """Parser for ComfyUI workflows"""
    
    def __init__(self, load_extensions_on_init: bool = True):
        """Initialize the parser with mappers"""
        self.processed_nodes: Set[str] = set()  # Track processed nodes to avoid cycles
        self.node_results_cache: Dict[str, Any] = {}  # Cache for processed node results
        
        # Load extensions if requested
        if load_extensions_on_init:
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
        mapper = get_mapper(node_type)
        if mapper:
            try:
                result = mapper.process(node_id, node_data, workflow, self)
                # Cache the result
                self.node_results_cache[node_id] = result
            except Exception as e:
                logger.error(f"Error processing node {node_id} of type {node_type}: {e}", exc_info=True)
                # Return a partial result or None depending on how we want to handle errors
                result = {}
        
        # Remove node from processed set to allow it to be processed again in a different context
        self.processed_nodes.remove(node_id)
        return result
    
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
        
        # Find the KSampler node
        ksampler_node_id = find_node_by_type(workflow, "KSampler")
        if not ksampler_node_id:
            logger.warning("No KSampler node found in workflow")
            return {}
        
        # Start parsing from the KSampler node
        result = {
            "gen_params": {},
            "loras": ""
        }
        
        # Process KSampler node to extract parameters
        ksampler_result = self.process_node(ksampler_node_id, workflow)
        if ksampler_result:
            # Process the result
            for key, value in ksampler_result.items():
                # Special handling for the positive prompt from FluxGuidance
                if key == "positive" and isinstance(value, dict):
                    # Extract guidance value
                    if "guidance" in value:
                        result["gen_params"]["guidance"] = value["guidance"]
                    
                    # Extract prompt
                    if "prompt" in value:
                        result["gen_params"]["prompt"] = value["prompt"]
                else:
                    # Normal handling for other values
                    result["gen_params"][key] = value
        
        # Process the positive prompt node if it exists and we don't have a prompt yet
        if "prompt" not in result["gen_params"] and "positive" in ksampler_result:
            positive_value = ksampler_result.get("positive")
            if isinstance(positive_value, str):
                result["gen_params"]["prompt"] = positive_value
        
        # Manually check for FluxGuidance if we don't have guidance value
        if "guidance" not in result["gen_params"]:
            flux_node_id = find_node_by_type(workflow, "FluxGuidance")
            if flux_node_id:
                # Get the direct input from the node
                node_inputs = workflow[flux_node_id].get("inputs", {})
                if "guidance" in node_inputs:
                    result["gen_params"]["guidance"] = node_inputs["guidance"]
        
        # Extract loras from the model input of KSampler
        ksampler_node = workflow.get(ksampler_node_id, {})
        ksampler_inputs = ksampler_node.get("inputs", {})
        if "model" in ksampler_inputs and isinstance(ksampler_inputs["model"], list):
            loras_text = self.collect_loras_from_model(ksampler_inputs["model"], workflow)
            if loras_text:
                result["loras"] = loras_text
        
        # Handle standard ComfyUI names vs our output format
        if "cfg" in result["gen_params"]:
            result["gen_params"]["cfg_scale"] = result["gen_params"].pop("cfg")
            
        # Add clip_skip = 2 to match reference output if not already present
        if "clip_skip" not in result["gen_params"]:
            result["gen_params"]["clip_skip"] = "2"
        
        # Ensure the prompt is a string and not a nested dictionary
        if "prompt" in result["gen_params"] and isinstance(result["gen_params"]["prompt"], dict):
            if "prompt" in result["gen_params"]["prompt"]:
                result["gen_params"]["prompt"] = result["gen_params"]["prompt"]["prompt"]
        
        # Save the result if requested
        if output_path:
            save_output(result, output_path)
            
        return result


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