#!/usr/bin/env python3
"""Script to verify the workflow structure and save the output to a file"""

import json
import os
from pathlib import Path

# Get project path
project_path = Path(__file__).parent.parent.parent
refs_path = project_path / "refs"
prompt_path = refs_path / "prompt.json"
output_path = refs_path / "output.json"
test_output_path = refs_path / "test_output.txt"

# Load the workflow JSON
with open(prompt_path, 'r', encoding='utf-8') as f:
    workflow_json = json.load(f)

# Load the expected output
with open(output_path, 'r', encoding='utf-8') as f:
    expected_output = json.load(f)

# Open the output file
with open(test_output_path, 'w', encoding='utf-8') as f:
    f.write(f"Loading workflow from {prompt_path}\n")
    f.write(f"Expected output from {output_path}\n\n")
    
    f.write("Expected output:\n")
    f.write(json.dumps(expected_output, indent=2) + "\n\n")
    
    # Manually extract important parameters
    sampler_node_id = "3"
    sampler_node = workflow_json.get(sampler_node_id, {})
    f.write("Sampler node:\n")
    f.write(json.dumps(sampler_node, indent=2) + "\n\n")
    
    # Extract seed, steps, cfg
    seed = sampler_node.get("inputs", {}).get("seed")
    steps = sampler_node.get("inputs", {}).get("steps")
    cfg = sampler_node.get("inputs", {}).get("cfg")
    
    f.write(f"Extracted parameters:\n")
    f.write(f"seed: {seed}\n")
    f.write(f"steps: {steps}\n")
    f.write(f"cfg_scale: {cfg}\n\n")
    
    # Extract positive prompt - this requires following node references
    positive_ref = sampler_node.get("inputs", {}).get("positive", [])
    if isinstance(positive_ref, list) and len(positive_ref) == 2:
        positive_node_id, slot_index = positive_ref
        positive_node = workflow_json.get(positive_node_id, {})
        
        f.write(f"Positive node ({positive_node_id}):\n")
        f.write(json.dumps(positive_node, indent=2) + "\n\n")
        
        # Follow the reference to the text value
        text_ref = positive_node.get("inputs", {}).get("text", [])
        if isinstance(text_ref, list) and len(text_ref) == 2:
            text_node_id, slot_index = text_ref
            text_node = workflow_json.get(text_node_id, {})
            
            f.write(f"Text node ({text_node_id}):\n")
            f.write(json.dumps(text_node, indent=2) + "\n\n")
            
            # If the text node is a JoinStrings node, follow its inputs
            if text_node.get("class_type") == "JoinStrings":
                string1_ref = text_node.get("inputs", {}).get("string1", [])
                string2_ref = text_node.get("inputs", {}).get("string2", [])
                
                if isinstance(string1_ref, list) and len(string1_ref) == 2:
                    string1_node_id, slot_index = string1_ref
                    string1_node = workflow_json.get(string1_node_id, {})
                    
                    f.write(f"String1 node ({string1_node_id}):\n")
                    f.write(json.dumps(string1_node, indent=2) + "\n\n")
                
                if isinstance(string2_ref, list) and len(string2_ref) == 2:
                    string2_node_id, slot_index = string2_ref
                    string2_node = workflow_json.get(string2_node_id, {})
                    
                    f.write(f"String2 node ({string2_node_id}):\n")
                    f.write(json.dumps(string2_node, indent=2) + "\n\n")
    
    # Extract negative prompt
    negative_ref = sampler_node.get("inputs", {}).get("negative", [])
    if isinstance(negative_ref, list) and len(negative_ref) == 2:
        negative_node_id, slot_index = negative_ref
        negative_node = workflow_json.get(negative_node_id, {})
        
        f.write(f"Negative node ({negative_node_id}):\n")
        f.write(json.dumps(negative_node, indent=2) + "\n\n")
    
    # Extract LoRA information
    lora_nodes = []
    for node_id, node_data in workflow_json.items():
        if node_data.get("class_type") in ["Lora Loader (LoraManager)", "Lora Stacker (LoraManager)"]:
            lora_nodes.append((node_id, node_data))
    
    f.write(f"LoRA nodes ({len(lora_nodes)}):\n")
    for node_id, node_data in lora_nodes:
        f.write(f"\nLoRA node {node_id}:\n")
        f.write(json.dumps(node_data, indent=2) + "\n")
    
    f.write("\nTest completed.\n")

print(f"Test output written to {test_output_path}") 