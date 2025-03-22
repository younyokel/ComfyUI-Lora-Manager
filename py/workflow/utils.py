"""
Utility functions for ComfyUI workflow parsing
"""
import json
import os
import logging
from typing import Dict, List, Any, Optional, Union, Set, Tuple

logger = logging.getLogger(__name__)

def load_workflow(workflow_path: str) -> Dict:
    """Load a workflow from a JSON file"""
    try:
        with open(workflow_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading workflow from {workflow_path}: {e}")
        raise

def save_output(output: Dict, output_path: str) -> None:
    """Save the parsed output to a JSON file"""
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output, f, indent=4)
    except Exception as e:
        logger.error(f"Error saving output to {output_path}: {e}")
        raise

def find_node_by_type(workflow: Dict, node_type: str) -> Optional[str]:
    """Find a node of the specified type in the workflow"""
    for node_id, node_data in workflow.items():
        if node_data.get("class_type") == node_type:
            return node_id
    return None

def find_nodes_by_type(workflow: Dict, node_type: str) -> List[str]:
    """Find all nodes of the specified type in the workflow"""
    return [node_id for node_id, node_data in workflow.items() 
            if node_data.get("class_type") == node_type]

def get_input_node_ids(workflow: Dict, node_id: str) -> Dict[str, Tuple[str, int]]:
    """
    Get the node IDs for all inputs of the given node
    
    Returns a dictionary mapping input names to (node_id, output_slot) tuples
    """
    result = {}
    if node_id not in workflow:
        return result
        
    node_data = workflow[node_id]
    for input_name, input_value in node_data.get("inputs", {}).items():
        # Check if this input is connected to another node
        if isinstance(input_value, list) and len(input_value) == 2:
            # Input is connected to another node's output
            # Format: [node_id, output_slot]
            ref_node_id, output_slot = input_value
            result[input_name] = (str(ref_node_id), output_slot)
            
    return result

def trace_model_path(workflow: Dict, start_node_id: str, 
                     visited: Optional[Set[str]] = None) -> List[str]:
    """
    Trace through the workflow graph following 'model' inputs
    to find all LoRA Loader nodes that affect the model
    
    Returns a list of LoRA Loader node IDs
    """
    if visited is None:
        visited = set()
        
    # Prevent cycles
    if start_node_id in visited:
        return []
        
    visited.add(start_node_id)
    
    node_data = workflow.get(start_node_id)
    if not node_data:
        return []
        
    # If this is a LoRA Loader node, add it to the result
    if node_data.get("class_type") == "Lora Loader (LoraManager)":
        return [start_node_id]
        
    # Get all input nodes
    input_nodes = get_input_node_ids(workflow, start_node_id)
    
    # Recursively trace the model input if it exists
    result = []
    if "model" in input_nodes:
        model_node_id, _ = input_nodes["model"]
        result.extend(trace_model_path(workflow, model_node_id, visited))
        
    # Also trace lora_stack input if it exists
    if "lora_stack" in input_nodes:
        lora_stack_node_id, _ = input_nodes["lora_stack"]
        result.extend(trace_model_path(workflow, lora_stack_node_id, visited))
        
    return result 