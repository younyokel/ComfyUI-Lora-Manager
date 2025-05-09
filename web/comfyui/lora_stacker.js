import { app } from "../../scripts/app.js";
import { dynamicImportByVersion } from "./utils.js";

// Update pattern to match both formats: <lora:name:model_strength> or <lora:name:model_strength:clip_strength>
const LORA_PATTERN = /<lora:([^:]+):([-\d\.]+)(?::([-\d\.]+))?>/g;

// Function to get the appropriate loras widget based on ComfyUI version
async function getLorasWidgetModule() {
    return await dynamicImportByVersion("./loras_widget.js", "./legacy_loras_widget.js");
}

// Function to get connected trigger toggle nodes
function getConnectedTriggerToggleNodes(node) {
    const connectedNodes = [];
    
    if (node.outputs && node.outputs.length > 0) {
        for (const output of node.outputs) {
            if (output.links && output.links.length > 0) {
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
        const loraNames = new Set();
        let match;
        LORA_PATTERN.lastIndex = 0;
        while ((match = LORA_PATTERN.exec(text)) !== null) {
            loraNames.add(match[1]);
        }
        
        fetch("/loramanager/get_trigger_words", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                lora_names: Array.from(loraNames),
                node_ids: connectedNodeIds
            })
        }).catch(err => console.error("Error fetching trigger words:", err));
    }
}

function mergeLoras(lorasText, lorasArr) {
    const result = [];
    let match;

    // Reset pattern index before using
    LORA_PATTERN.lastIndex = 0;
    
    // Parse text input and create initial entries
    while ((match = LORA_PATTERN.exec(lorasText)) !== null) {
        const name = match[1];
        const modelStrength = Number(match[2]);
        // Extract clip strength if provided, otherwise use model strength
        const clipStrength = match[3] ? Number(match[3]) : modelStrength;
        
        // Find if this lora exists in the array data
        const existingLora = lorasArr.find(l => l.name === name);
        
        result.push({
            name: name,
            // Use existing strength if available, otherwise use input strength
            strength: existingLora ? existingLora.strength : modelStrength,
            active: existingLora ? existingLora.active : true,
            clipStrength: existingLora ? existingLora.clipStrength : clipStrength,
        });
    }

    return result;
}

app.registerExtension({
    name: "LoraManager.LoraStacker",
    
    async nodeCreated(node) {
        if (node.comfyClass === "Lora Stacker (LoraManager)") {
            // Enable widget serialization
            node.serialize_widgets = true;

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
                        
                        // Update trigger words when lorasWidget changes
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
                        
                        // Update trigger words when input changes
                        updateConnectedTriggerWords(node, value);
                    } finally {
                        isUpdating = false;
                    }
                };
            });
        }
    },
});