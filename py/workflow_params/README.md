# ComfyUI Workflow Parser

A module for parsing ComfyUI workflow JSON and extracting generation parameters.

## Features

- Parse ComfyUI workflow JSON files to extract generation parameters
- Extract lora information from workflows
- Support for node traversal and parameter resolution
- Extensible architecture for supporting custom node types
- Dynamic loading of node processor extensions

## Usage

### Basic Usage

```python
from workflow_params import parse_workflow

# Parse from a file
with open('my_workflow.json', 'r') as f:
    workflow_json = f.read()
    
result = parse_workflow(workflow_json)
print(result)
```

### Using the WorkflowParser directly

```python
from workflow_params import WorkflowParser

parser = WorkflowParser()
result = parser.parse_workflow(workflow_json)
```

### Loading Extensions

Extensions are loaded automatically by default, but you can also control this behavior:

```python
from workflow_params import WorkflowParser

# Don't load extensions
parser = WorkflowParser(load_extensions=False)

# Load extensions from a custom directory
parser = WorkflowParser(extensions_dir='/path/to/extensions')
```

### Creating Custom Node Processors

To support a custom node type, create a processor class:

```python
from workflow_params import NodeProcessor, register_processor

@register_processor
class CustomNodeProcessor(NodeProcessor):
    """Processor for CustomNode nodes"""
    
    NODE_CLASS_TYPE = "CustomNode"
    REQUIRED_FIELDS = {"param1", "param2"}
    
    def process(self, workflow_parser):
        result = {}
        
        # Extract direct values
        if "param1" in self.inputs:
            result["value1"] = self.inputs["param1"]
            
        # Resolve referenced inputs
        if "param2" in self.inputs:
            result["value2"] = self.resolve_input("param2", workflow_parser)
            
        return result
```

## Command Line Interface

A command-line interface is available for testing:

```bash
python -m workflow_params.cli input_workflow.json -o output.json
```

## Extension System

The module includes an extension system for dynamically loading node processors:

```python
from workflow_params import get_extension_manager

# Get the extension manager
manager = get_extension_manager()

# Load all extensions
manager.load_all_extensions()

# Load a specific extension
manager.load_extension('path/to/extension.py')
```

Extensions should be placed in the `workflow_params/extensions` directory by default, or a custom directory can be specified.

## Supported Node Types

- KSampler
- CLIPTextEncode
- EmptyLatentImage
- JoinStrings
- StringConstantMultiline
- CLIPSetLastLayer
- TriggerWord Toggle (LoraManager)
- Lora Loader (LoraManager)
- Lora Stacker (LoraManager) 