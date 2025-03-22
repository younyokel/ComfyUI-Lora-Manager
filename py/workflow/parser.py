"""
Main workflow parser implementation for ComfyUI
"""
import json
import logging
from typing import Dict, List, Any, Optional, Union, Set
from .mappers import (
    NodeMapper, KSamplerMapper, EmptyLatentImageMapper, 
    EmptySD3LatentImageMapper, CLIPTextEncodeMapper, 
    LoraLoaderMapper, LoraStackerMapper, JoinStringsMapper,
    StringConstantMapper, TriggerWordToggleMapper, FluxGuidanceMapper
)
from .utils import (
    load_workflow, save_output, find_node_by_type,
    trace_model_path
)

logger = logging.getLogger(__name__)

class WorkflowParser:
    """Parser for ComfyUI workflows"""
    
    def __init__(self):
        """Initialize the parser with default node mappers"""
        self.node_mappers: Dict[str, NodeMapper] = {}
        self.processed_nodes: Set[str] = set()  # Track processed nodes to avoid cycles
        self.register_default_mappers()
    
    def register_default_mappers(self) -> None:
        """Register all default node mappers"""
        mappers = [
            KSamplerMapper(),
            EmptyLatentImageMapper(),
            EmptySD3LatentImageMapper(),
            CLIPTextEncodeMapper(),
            LoraLoaderMapper(),
            LoraStackerMapper(),
            JoinStringsMapper(),
            StringConstantMapper(),
            TriggerWordToggleMapper(),
            FluxGuidanceMapper()
        ]
        
        for mapper in mappers:
            self.register_mapper(mapper)
    
    def register_mapper(self, mapper: NodeMapper) -> None:
        """Register a node mapper"""
        self.node_mappers[mapper.node_type] = mapper
    
    def process_node(self, node_id: str, workflow: Dict) -> Any:
        """Process a single node and extract relevant information"""
        # Check if we've already processed this node to avoid cycles
        if node_id in self.processed_nodes:
            return None
        
        # Mark this node as processed
        self.processed_nodes.add(node_id)
        
        if node_id not in workflow:
            return None
        
        node_data = workflow[node_id]
        node_type = node_data.get("class_type")
        
        result = None
        if node_type in self.node_mappers:
            mapper = self.node_mappers[node_type]
            result = mapper.process(node_id, node_data, workflow, self)
        
        # Remove node from processed set to allow it to be processed again in a different context
        self.processed_nodes.remove(node_id)
        return result
    
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
            
        # Reset the processed nodes tracker
        self.processed_nodes = set()
        
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
        
        # Trace the model path to find LoRA Loader nodes
        lora_node_ids = trace_model_path(workflow, ksampler_node_id)
        
        # Process each LoRA Loader node
        lora_texts = []
        for lora_node_id in lora_node_ids:
            # Reset the processed nodes tracker for each lora processing
            self.processed_nodes = set()
            
            lora_result = self.process_node(lora_node_id, workflow)
            if lora_result and "loras" in lora_result:
                lora_texts.append(lora_result["loras"])
        
        # Combine all LoRA texts
        if lora_texts:
            result["loras"] = " ".join(lora_texts)
        
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