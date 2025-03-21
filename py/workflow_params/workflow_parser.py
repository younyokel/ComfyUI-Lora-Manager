import json
import logging
from typing import Dict, Any, List, Optional, Set, Union
from .node_processors import NODE_PROCESSORS, NodeProcessor
from .extension_manager import get_extension_manager

logger = logging.getLogger(__name__)

class WorkflowParser:
    """Parser for ComfyUI workflow JSON files"""
    
    def __init__(self, load_extensions: bool = True, extensions_dir: str = None):
        """
        Initialize the workflow parser
        
        Args:
            load_extensions: Whether to load extensions automatically
            extensions_dir: Optional path to extensions directory
        """
        self.workflow = None
        self.processed_nodes = {}  # Cache for processed nodes
        self.processing_nodes = set()  # To detect circular references
        
        # Load extensions if requested
        if load_extensions:
            self._load_extensions(extensions_dir)
    
    def _load_extensions(self, extensions_dir: str = None):
        """
        Load node processor extensions
        
        Args:
            extensions_dir: Optional path to extensions directory
        """
        extension_manager = get_extension_manager(extensions_dir)
        results = extension_manager.load_all_extensions()
        
        # Log the results
        successful = sum(1 for status in results.values() if status)
        logger.debug(f"Loaded {successful} of {len(results)} extensions")
    
    def parse_workflow(self, workflow_json: Union[str, Dict]) -> Dict[str, Any]:
        """
        Parse a ComfyUI workflow JSON string or dict and extract generation parameters
        
        Args:
            workflow_json: JSON string or dict containing the workflow
            
        Returns:
            Dict containing extracted generation parameters
        """
        # Reset state for this parsing operation
        self.processed_nodes = {}
        self.processing_nodes = set()
        
        # Load JSON if it's a string
        if isinstance(workflow_json, str):
            try:
                self.workflow = json.loads(workflow_json)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse workflow JSON: {e}")
                return {}
        else:
            self.workflow = workflow_json
        
        if not self.workflow:
            return {}
            
        # Find KSampler nodes as entry points
        ksampler_nodes = self._find_nodes_by_class("KSampler")
        
        # Find LoraLoader nodes for lora information
        lora_nodes = self._find_nodes_by_class("Lora Loader (LoraManager)")
        
        # Check if we need to register additional node types by scanning the workflow
        self._check_for_unregistered_node_types()
        
        result = {
            "gen_params": {}
        }
        
        # Process KSampler nodes to get generation parameters
        for node_id in ksampler_nodes:
            gen_params = self.process_node(node_id)
            if gen_params:
                result["gen_params"].update(gen_params)
        
        # Process Lora nodes to get lora stack
        lora_stack = ""
        for node_id in lora_nodes:
            lora_info = self.process_node(node_id)
            if lora_info and "lora_stack" in lora_info:
                if lora_stack:
                    lora_stack = f"{lora_stack} {lora_info['lora_stack']}"
                else:
                    lora_stack = lora_info["lora_stack"]
        
        if lora_stack:
            result["loras"] = lora_stack
            
        # Process CLIPSetLastLayer node for clip_skip
        clip_layer_nodes = self._find_nodes_by_class("CLIPSetLastLayer")
        for node_id in clip_layer_nodes:
            clip_info = self.process_node(node_id)
            if clip_info and "clip_skip" in clip_info:
                result["gen_params"]["clip_skip"] = clip_info["clip_skip"]
        
        return result
    
    def _check_for_unregistered_node_types(self):
        """Check for node types in the workflow that aren't registered yet"""
        unknown_node_types = set()
        
        # Collect all unique node types in the workflow
        for node_id, node_data in self.workflow.items():
            class_type = node_data.get("class_type")
            if class_type and class_type not in NODE_PROCESSORS:
                unknown_node_types.add(class_type)
        
        if unknown_node_types:
            logger.debug(f"Found {len(unknown_node_types)} unregistered node types: {unknown_node_types}")
    
    def process_node(self, node_id: str) -> Any:
        """
        Process a single node and its dependencies recursively
        
        Args:
            node_id: The ID of the node to process
            
        Returns:
            Processed data from the node
        """
        # Check if already processed
        if node_id in self.processed_nodes:
            return self.processed_nodes[node_id]
        
        # Check for circular references
        if node_id in self.processing_nodes:
            logger.warning(f"Circular reference detected for node {node_id}")
            return None
        
        # Mark as being processed
        self.processing_nodes.add(node_id)
        
        # Get node data
        node_data = self.workflow.get(node_id)
        if not node_data:
            logger.warning(f"Node {node_id} not found in workflow")
            self.processing_nodes.remove(node_id)
            return None
        
        class_type = node_data.get("class_type")
        if not class_type:
            logger.warning(f"Node {node_id} has no class_type")
            self.processing_nodes.remove(node_id)
            return None
        
        # Get the appropriate node processor
        processor_class = NODE_PROCESSORS.get(class_type)
        if not processor_class:
            logger.debug(f"No processor for node type {class_type}")
            self.processing_nodes.remove(node_id)
            return None
        
        # Process the node
        processor = processor_class(node_id, node_data, self.workflow)
        result = processor.process(self)
        
        # Cache the result
        self.processed_nodes[node_id] = result
        
        # Mark as processed
        self.processing_nodes.remove(node_id)
        
        return result
    
    def _find_nodes_by_class(self, class_type: str) -> List[str]:
        """
        Find all nodes of a particular class type in the workflow
        
        Args:
            class_type: The node class type to find
            
        Returns:
            List of node IDs matching the class type
        """
        nodes = []
        for node_id, node_data in self.workflow.items():
            if node_data.get("class_type") == class_type:
                nodes.append(node_id)
        return nodes


def parse_workflow(workflow_json: Union[str, Dict], 
                  load_extensions: bool = True, 
                  extensions_dir: str = None) -> Dict[str, Any]:
    """
    Helper function to parse a workflow JSON without having to create a parser instance
    
    Args:
        workflow_json: JSON string or dict containing the workflow
        load_extensions: Whether to load extensions automatically
        extensions_dir: Optional path to extensions directory
        
    Returns:
        Dict containing extracted generation parameters
    """
    parser = WorkflowParser(load_extensions, extensions_dir)
    return parser.parse_workflow(workflow_json) 