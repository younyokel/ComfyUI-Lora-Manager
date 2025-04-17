import time
from nodes import NODE_CLASS_MAPPINGS
from .node_extractors import NODE_EXTRACTORS, GenericNodeExtractor
from .constants import METADATA_CATEGORIES

class MetadataRegistry:
    """A singleton registry to store and retrieve workflow metadata"""
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._reset()
        return cls._instance
    
    def _reset(self):
        self.current_prompt_id = None
        self.current_prompt = None
        self.metadata = {}
        self.prompt_metadata = {}
        self.executed_nodes = set()
        
        # Node-level cache for metadata
        self.node_cache = {}
        
        # Categories we want to track and retrieve from cache
        self.metadata_categories = METADATA_CATEGORIES
    
    def start_collection(self, prompt_id):
        """Begin metadata collection for a new prompt"""
        self.current_prompt_id = prompt_id
        self.executed_nodes = set()
        self.prompt_metadata[prompt_id] = {
            category: {} for category in METADATA_CATEGORIES
        }
        # Add additional metadata fields
        self.prompt_metadata[prompt_id].update({
            "execution_order": [],
            "current_prompt": None,  # Will store the prompt object
            "timestamp": time.time()
        })
    
    def set_current_prompt(self, prompt):
        """Set the current prompt object reference"""
        self.current_prompt = prompt
        if self.current_prompt_id and self.current_prompt_id in self.prompt_metadata:
            # Store the prompt in the metadata for later relationship tracing
            self.prompt_metadata[self.current_prompt_id]["current_prompt"] = prompt
        
    def get_metadata(self, prompt_id=None):
        """Get collected metadata for a prompt"""
        key = prompt_id if prompt_id is not None else self.current_prompt_id
        if key not in self.prompt_metadata:
            return {}
            
        metadata = self.prompt_metadata[key]
        
        # If we have a current prompt object, check for non-executed nodes
        prompt_obj = metadata.get("current_prompt")
        if prompt_obj and hasattr(prompt_obj, "original_prompt"):
            original_prompt = prompt_obj.original_prompt
            
            # Fill in missing metadata from cache for nodes that weren't executed
            self._fill_missing_metadata(key, original_prompt)
            
        return self.prompt_metadata.get(key, {})
    
    def _fill_missing_metadata(self, prompt_id, original_prompt):
        """Fill missing metadata from cache for non-executed nodes"""
        if not original_prompt:
            return
            
        executed_nodes = self.executed_nodes
        metadata = self.prompt_metadata[prompt_id]
        
        # Iterate through nodes in the original prompt
        for node_id, node_data in original_prompt.items():
            # Skip if already executed in this run
            if node_id in executed_nodes:
                continue
                
            # Get the node type from the prompt (this is the key in NODE_CLASS_MAPPINGS)
            prompt_class_type = node_data.get("class_type")
            if not prompt_class_type:
                continue
                
            # Convert to actual class name (which is what we use in our cache)
            class_type = prompt_class_type
            if prompt_class_type in NODE_CLASS_MAPPINGS:
                class_obj = NODE_CLASS_MAPPINGS[prompt_class_type]
                class_type = class_obj.__name__
            
            # Create cache key using the actual class name
            cache_key = f"{node_id}:{class_type}"
            
            # Check if this node type is relevant for metadata collection
            if class_type in NODE_EXTRACTORS:
                # Check if we have cached metadata for this node
                if cache_key in self.node_cache:
                    cached_data = self.node_cache[cache_key]
                    
                    # Apply cached metadata to the current metadata
                    for category in self.metadata_categories:
                        if category in cached_data and node_id in cached_data[category]:
                            if node_id not in metadata[category]:
                                metadata[category][node_id] = cached_data[category][node_id]
    
    def record_node_execution(self, node_id, class_type, inputs, outputs):
        """Record information about a node's execution"""
        if not self.current_prompt_id:
            return
            
        # Add to execution order and mark as executed
        if node_id not in self.executed_nodes:
            self.executed_nodes.add(node_id)
            self.prompt_metadata[self.current_prompt_id]["execution_order"].append(node_id)
        
        # Process inputs to simplify working with them
        processed_inputs = {}
        for input_name, input_values in inputs.items():
            if isinstance(input_values, list) and len(input_values) > 0:
                # For single values, just use the first one (most common case)
                processed_inputs[input_name] = input_values[0]
            else:
                processed_inputs[input_name] = input_values
            
        # Extract node-specific metadata
        extractor = NODE_EXTRACTORS.get(class_type, GenericNodeExtractor)
        extractor.extract(
            node_id, 
            processed_inputs, 
            outputs, 
            self.prompt_metadata[self.current_prompt_id]
        )
        
        # Cache this node's metadata
        self._cache_node_metadata(node_id, class_type)
    
    def update_node_execution(self, node_id, class_type, outputs):
        """Update node metadata with output information"""
        if not self.current_prompt_id:
            return
        
        # Process outputs to make them more usable
        processed_outputs = outputs
            
        # Use the same extractor to update with outputs
        extractor = NODE_EXTRACTORS.get(class_type, GenericNodeExtractor)
        if hasattr(extractor, 'update'):
            extractor.update(
                node_id, 
                processed_outputs, 
                self.prompt_metadata[self.current_prompt_id]
            )
            
        # Update the cached metadata for this node
        self._cache_node_metadata(node_id, class_type)
            
    def _cache_node_metadata(self, node_id, class_type):
        """Cache the metadata for a specific node"""
        if not self.current_prompt_id or not node_id or not class_type:
            return
            
        # Create a cache key combining node_id and class_type
        cache_key = f"{node_id}:{class_type}"
        
        # Create a shallow copy of the node's metadata
        node_metadata = {}
        current_metadata = self.prompt_metadata[self.current_prompt_id]
        
        for category in self.metadata_categories:
            if category in current_metadata and node_id in current_metadata[category]:
                if category not in node_metadata:
                    node_metadata[category] = {}
                node_metadata[category][node_id] = current_metadata[category][node_id]
        
        # Save to cache if we have any metadata for this node
        if any(node_metadata.values()):
            self.node_cache[cache_key] = node_metadata
