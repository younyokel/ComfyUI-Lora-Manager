import json
import sys
from py.workflow.parser import WorkflowParser
from py.workflow.utils import trace_model_path

# Load workflow data
with open('refs/prompt.json', 'r') as f:
    workflow_data = json.load(f)

# Parse workflow
parser = WorkflowParser()
try:
    # Find KSampler node
    ksampler_node = None
    for node_id, node in workflow_data.items():
        if node.get("class_type") == "KSampler":
            ksampler_node = node_id
            break
    
    if not ksampler_node:
        print("KSampler node not found")
        sys.exit(1)
    
    # Trace all Lora nodes
    print("Finding Lora nodes in the workflow...")
    lora_nodes = trace_model_path(workflow_data, ksampler_node)
    print(f"Found Lora nodes: {lora_nodes}")
    
    # Print node details
    for node_id in lora_nodes:
        node = workflow_data[node_id]
        print(f"\nNode {node_id}: {node.get('class_type')}")
        for key, value in node.get("inputs", {}).items():
            print(f"  - {key}: {value}")
    
    # Parse the workflow
    result = parser.parse_workflow(workflow_data)
    print("\nParsing successful!")
    print(json.dumps(result, indent=2))
    sys.exit(0)
except Exception as e:
    print(f"Error parsing workflow: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1) 