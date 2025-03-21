#!/usr/bin/env python3
"""Simple test script for the workflow parser"""

import json
import os
import sys
from pathlib import Path

# Get project path
project_path = Path(__file__).parent.parent.parent
refs_path = project_path / "refs"
prompt_path = refs_path / "prompt.json"
output_path = refs_path / "output.json"

print(f"Loading workflow from {prompt_path}")
print(f"Expected output from {output_path}")

# Load the workflow JSON
with open(prompt_path, 'r', encoding='utf-8') as f:
    workflow_json = json.load(f)

# Load the expected output
with open(output_path, 'r', encoding='utf-8') as f:
    expected_output = json.load(f)

print("\nExpected output:")
print(json.dumps(expected_output, indent=2))

# Manually extract important parameters to verify our understanding
sampler_node_id = "3"
sampler_node = workflow_json.get(sampler_node_id, {})
print("\nSampler node:")
print(json.dumps(sampler_node, indent=2))

# Extract seed, steps, cfg
seed = sampler_node.get("inputs", {}).get("seed")
steps = sampler_node.get("inputs", {}).get("steps")
cfg = sampler_node.get("inputs", {}).get("cfg")

print(f"\nExtracted parameters:")
print(f"seed: {seed}")
print(f"steps: {steps}")
print(f"cfg_scale: {cfg}")

# Extract positive prompt - this requires following node references
positive_ref = sampler_node.get("inputs", {}).get("positive", [])
if isinstance(positive_ref, list) and len(positive_ref) == 2:
    positive_node_id, slot_index = positive_ref
    positive_node = workflow_json.get(positive_node_id, {})
    
    print(f"\nPositive node ({positive_node_id}):")
    print(json.dumps(positive_node, indent=2))
    
    # Follow the reference to the text value
    text_ref = positive_node.get("inputs", {}).get("text", [])
    if isinstance(text_ref, list) and len(text_ref) == 2:
        text_node_id, slot_index = text_ref
        text_node = workflow_json.get(text_node_id, {})
        
        print(f"\nText node ({text_node_id}):")
        print(json.dumps(text_node, indent=2))

print("\nTest completed.") 