import json
from py.workflow.parser import WorkflowParser

# Load workflow data
with open('refs/prompt.json', 'r') as f:
    workflow_data = json.load(f)

# Parse workflow
parser = WorkflowParser()
try:
    # Parse the workflow
    result = parser.parse_workflow(workflow_data)
    print("Parsing successful!")
    
    # Print each component separately
    print("\nGeneration Parameters:")
    for k, v in result.get("gen_params", {}).items():
        print(f"  {k}: {v}")
    
    print("\nLoRAs:")
    print(result.get("loras", ""))
except Exception as e:
    print(f"Error parsing workflow: {e}")
    import traceback
    traceback.print_exc() 