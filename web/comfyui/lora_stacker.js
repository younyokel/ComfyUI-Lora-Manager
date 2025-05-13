import { app } from "../../scripts/app.js";
import { 
    getLorasWidgetModule, 
    LORA_PATTERN, 
    getActiveLorasFromNode,
    collectActiveLorasFromChain,
    updateConnectedTriggerWords
} from "./utils.js";

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
                    // 0 for input widget, 1 for loras widget
                    const savedValue = node.widgets_values[1];
                    existingLoras = savedValue || [];
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
                        
                        // Update this stacker's direct trigger toggles with its own active loras
                        const activeLoraNames = new Set();
                        value.forEach(lora => {
                            if (lora.active) {
                                activeLoraNames.add(lora.name);
                            }
                        });
                        updateConnectedTriggerWords(node, activeLoraNames);
                        
                        // Find all Lora Loader nodes in the chain that might need updates
                        updateDownstreamLoaders(node);
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
                        
                        // Update this stacker's direct trigger toggles with its own active loras
                        const activeLoraNames = getActiveLorasFromNode(node);
                        updateConnectedTriggerWords(node, activeLoraNames);
                        
                        // Find all Lora Loader nodes in the chain that might need updates
                        updateDownstreamLoaders(node);
                    } finally {
                        isUpdating = false;
                    }
                };
            });
        }
    },
});

// Helper function to find and update downstream Lora Loader nodes
function updateDownstreamLoaders(startNode, visited = new Set()) {
    if (visited.has(startNode.id)) return;
    visited.add(startNode.id);
    
    // Check each output link
    if (startNode.outputs) {
        for (const output of startNode.outputs) {
            if (output.links) {
                for (const linkId of output.links) {
                    const link = app.graph.links[linkId];
                    if (link) {
                        const targetNode = app.graph.getNodeById(link.target_id);
                        
                        // If target is a Lora Loader, collect all active loras in the chain and update
                        if (targetNode && targetNode.comfyClass === "Lora Loader (LoraManager)") {
                            const allActiveLoraNames = collectActiveLorasFromChain(targetNode);
                            updateConnectedTriggerWords(targetNode, allActiveLoraNames);
                        }
                        // If target is another Lora Stacker, recursively check its outputs
                        else if (targetNode && targetNode.comfyClass === "Lora Stacker (LoraManager)") {
                            updateDownstreamLoaders(targetNode, visited);
                        }
                    }
                }
            }
        }
    }
}