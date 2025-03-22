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

def trace_model_path(workflow: Dict, start_node_id: str) -> List[str]:
    """
    Trace the model path backward from KSampler to find all LoRA nodes
    
    Args:
        workflow: The workflow data
        start_node_id: The starting node ID (usually KSampler)
        
    Returns:
        List of node IDs in the model path
    """
    model_path_nodes = []
    
    # Get the model input from the start node
    if start_node_id not in workflow:
        return model_path_nodes
    
    # Track visited nodes to avoid cycles
    visited = set()
    
    # Stack for depth-first search
    stack = []
    
    # Get model input reference if available
    start_node = workflow[start_node_id]
    if "inputs" in start_node and "model" in start_node["inputs"] and isinstance(start_node["inputs"]["model"], list):
        model_ref = start_node["inputs"]["model"]
        stack.append(str(model_ref[0]))
    
    # Perform depth-first search
    while stack:
        node_id = stack.pop()
        
        # Skip if already visited
        if node_id in visited:
            continue
        
        # Mark as visited
        visited.add(node_id)
        
        # Skip if node doesn't exist
        if node_id not in workflow:
            continue
        
        node = workflow[node_id]
        node_type = node.get("class_type", "")
        
        # Add current node to result list if it's a LoRA node
        if "Lora" in node_type:
            model_path_nodes.append(node_id)
        
        # Add all input nodes that have a "model" or "lora_stack" output to the stack
        if "inputs" in node:
            for input_name, input_value in node["inputs"].items():
                if input_name in ["model", "lora_stack"] and isinstance(input_value, list) and len(input_value) == 2:
                    stack.append(str(input_value[0]))
    
    return model_path_nodes 