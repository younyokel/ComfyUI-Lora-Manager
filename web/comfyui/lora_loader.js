import { app } from "../../scripts/app.js";
import { dynamicImportByVersion } from "./utils.js";

// Extract pattern into a constant for consistent use
const LORA_PATTERN = /<lora:([^:]+):([-\d\.]+)>/g;

// Function to get the appropriate loras widget based on ComfyUI version
async function getLorasWidgetModule() {
    return await dynamicImportByVersion("./loras_widget.js", "./legacy_loras_widget.js");
}

// Function to get connected trigger toggle nodes
function getConnectedTriggerToggleNodes(node) {
    const connectedNodes = [];
    
    // Check if node has outputs
    if (node.outputs && node.outputs.length > 0) {
        // For each output slot
        for (const output of node.outputs) {
            // Check if this output has any links
            if (output.links && output.links.length > 0) {
                // For each link, get the target node
                for (const linkId of output.links) {
                    const link = app.graph.links[linkId];
                    if (link) {
                        const targetNode = app.graph.getNodeById(link.target_id);
                        if (targetNode && targetNode.comfyClass === "TriggerWord Toggle (LoraManager)") {
                            connectedNodes.push(targetNode.id);
                        }
                    }
                }
            }
        }
    }
    return connectedNodes;
}

// Function to update trigger words for connected toggle nodes
function updateConnectedTriggerWords(node, text) {
    const connectedNodeIds = getConnectedTriggerToggleNodes(node);
    if (connectedNodeIds.length > 0) {
        // Extract lora names from the text
        const loraNames = [];
        let match;
        // Reset the RegExp object's lastIndex to start from the beginning
        LORA_PATTERN.lastIndex = 0;
        while ((match = LORA_PATTERN.exec(text)) !== null) {
            loraNames.push(match[1]); // match[1] contains the lora name
        }
        
        // Call API to get trigger words
        fetch("/loramanager/get_trigger_words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                lora_names: loraNames,
                node_ids: connectedNodeIds
            })
        }).catch(err => console.error("Error fetching trigger words:", err));
    }
}

function mergeLoras(lorasText, lorasArr) {
    const result = [];
    let match;

    // Parse text input and create initial entries
    while ((match = LORA_PATTERN.exec(lorasText)) !== null) {
        const name = match[1];
        const inputStrength = Number(match[2]);
        
        // Find if this lora exists in the array data
        const existingLora = lorasArr.find(l => l.name === name);
        
        result.push({
            name: name,
            // Use existing strength if available, otherwise use input strength
            strength: existingLora ? existingLora.strength : inputStrength,
            active: existingLora ? existingLora.active : true
        });
    }

    return result;
}

app.registerExtension({
    name: "LoraManager.LoraLoader",
    
    async nodeCreated(node) {
        if (node.comfyClass === "Lora Loader (LoraManager)") {
            // Enable widget serialization
            node.serialize_widgets = true;

            node.addInput('clip', 'CLIP', {
                "shape": 7
            });

            node.addInput("lora_stack", 'LORA_STACK', {
                "shape": 7  // 7 is the shape of the optional input
            });

            // Wait for node to be properly initialized
            requestAnimationFrame(async () => {
                // Restore saved value if exists
                let existingLoras = [];
                if (node.widgets_values && node.widgets_values.length > 0) {
                    const savedValue = node.widgets_values[1];
                    // TODO: clean up this code
                    try {
                        // Check if the value is already an array/object
                        if (typeof savedValue === 'object' && savedValue !== null) {
                            existingLoras = savedValue;
                        } else if (typeof savedValue === 'string') {
                            existingLoras = JSON.parse(savedValue);
                        }
                    } catch (e) {
                        console.warn("Failed to parse loras data:", e);
                        existingLoras = [];
                    }
                }
                // Merge the loras data
                const mergedLoras = mergeLoras(node.widgets[0].value, existingLoras);
                
                // Add flag to prevent callback loops
                let isUpdating = false;
                
                // Dynamically load the appropriate widget module
                const lorasModule = await getLorasWidgetModule();
                const { addLorasWidget } = lorasModule;
                 
                // Get the widget object directly from the returned object
                const result = addLorasWidget(node, "loras", {
                    defaultVal: mergedLoras  // Pass object directly
                }, (value) => {
                    // Prevent recursive calls
                    if (isUpdating) return;
                    isUpdating = true;
                    
                    try {
                        // Remove loras that are not in the value array
                        const inputWidget = node.widgets[0];
                        const currentLoras = value.map(l => l.name);
                        
                        // Use the constant pattern here as well
                        let newText = inputWidget.value.replace(LORA_PATTERN, (match, name, strength) => {
                            return currentLoras.includes(name) ? match : '';
                        });
                        
                        // Clean up multiple spaces and trim
                        newText = newText.replace(/\s+/g, ' ').trim();
                        
                        inputWidget.value = newText;
                        
                        // Add this line to update trigger words when lorasWidget changes cause inputWidget value to change
                        updateConnectedTriggerWords(node, newText);
                    } finally {
                        isUpdating = false;
                    }
                });
                
                node.lorasWidget = result.widget;

                // Update input widget callback
                const inputWidget = node.widgets[0];
                inputWidget.callback = (value) => {
                    if (isUpdating) return;
                    isUpdating = true;
                    
                    try {
                        const currentLoras = node.lorasWidget.value || [];
                        const mergedLoras = mergeLoras(value, currentLoras);
                        
                        node.lorasWidget.value = mergedLoras;
                        
                        // Replace the existing trigger word update code with the new function
                        updateConnectedTriggerWords(node, value);
                    } finally {
                        isUpdating = false;
                    }
                };
            });
        }
    },
});