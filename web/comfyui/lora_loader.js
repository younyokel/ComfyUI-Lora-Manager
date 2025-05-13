import { app } from "../../scripts/app.js";
import { 
    getLorasWidgetModule,
    LORA_PATTERN,
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
                        let newText = inputWidget.value.replace(LORA_PATTERN, (match, name, strength, clipStrength) => {
                            return currentLoras.includes(name) ? match : '';
                        });
                        
                        // Clean up multiple spaces and trim
                        newText = newText.replace(/\s+/g, ' ').trim();
                        
                        inputWidget.value = newText;
                        
                        // Collect all active loras from this node and its input chain
                        const allActiveLoraNames = collectActiveLorasFromChain(node);
                        
                        // Update trigger words for connected toggle nodes with the aggregated lora names
                        updateConnectedTriggerWords(node, allActiveLoraNames);
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
                        
                        // Collect all active loras from this node and its input chain
                        const allActiveLoraNames = collectActiveLorasFromChain(node);
                        
                        // Update trigger words for connected toggle nodes with the aggregated lora names
                        updateConnectedTriggerWords(node, allActiveLoraNames);
                    } finally {
                        isUpdating = false;
                    }
                };
            });
        }
    },
});