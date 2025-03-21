from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Set, Callable, Type

# Registry to store node processors by class_type
NODE_PROCESSORS: Dict[str, Type['NodeProcessor']] = {}

class NodeProcessor(ABC):
    """Base class for node processors that extract information from workflow nodes"""
    
    # Class-level attributes to define which node type this processor handles
    # and which fields should be extracted
    NODE_CLASS_TYPE: str = None
    REQUIRED_FIELDS: Set[str] = set()
    
    def __init__(self, node_id: str, node_data: Dict[str, Any], workflow: Dict[str, Any]):
        """
        Initialize a node processor
        
        Args:
            node_id: The ID of the node in the workflow
            node_data: The node data from the workflow
            workflow: The complete workflow data
        """
        self.node_id = node_id
        self.node_data = node_data
        self.workflow = workflow
        self.inputs = node_data.get('inputs', {})
        
    @classmethod
    def register(cls):
        """Register this processor in the global registry"""
        if cls.NODE_CLASS_TYPE:
            NODE_PROCESSORS[cls.NODE_CLASS_TYPE] = cls
            
    @abstractmethod
    def process(self, workflow_parser) -> Dict[str, Any]:
        """
        Process the node and extract relevant information
        
        Args:
            workflow_parser: The workflow parser instance for resolving node references
            
        Returns:
            Dict containing extracted information from the node
        """
        pass
    
    def resolve_input(self, input_key: str, workflow_parser) -> Any:
        """
        Resolve an input value which might be a reference to another node
        
        Args:
            input_key: The input key to resolve
            workflow_parser: The workflow parser instance
            
        Returns:
            The resolved value
        """
        input_value = self.inputs.get(input_key)
        
        # If not found, return None
        if input_value is None:
            return None
            
        # If it's a list with node reference [node_id, slot_index]
        if isinstance(input_value, list) and len(input_value) == 2:
            ref_node_id, slot_index = input_value
            return workflow_parser.process_node(ref_node_id)
        
        # Otherwise return the direct value
        return input_value


def register_processor(cls):
    """Decorator to register a node processor class"""
    cls.register()
    return cls 