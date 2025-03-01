import { app } from "../../scripts/app.js";
import { addLorasWidget } from "./loras_widget.js";
import { hideWidgetForGood } from "./utils.js";

function mergeLoras(lorasText, lorasJson) {
    const result = [];
    const pattern = /<lora:([^:]+):([\d\.]+)>/g;
    let match;

    // Parse text input and create initial entries
    while ((match = pattern.exec(lorasText)) !== null) {
        const name = match[1];
        const inputStrength = Number(match[2]);
        
        // Find if this lora exists in the JSON data
        const existingLora = lorasJson.find(l => l.name === name);
        
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
    
    setup(...args) {
        console.log("LoraLoader setup args:", args);
    },
    
    async nodeCreated(node) {
        if (node.comfyClass === "Lora Loader (LoraManager)") {
            // Enable widget serialization
            node.serialize_widgets = true;

            // Wait for node to be properly initialized
            requestAnimationFrame(() => {               
                // Restore saved value if exists
                let existingLoras = [];
                if (node.widgets_values && node.widgets_values.length > 0) {
                    // 0 is input, 1 is loras widget
                    try {
                        existingLoras = JSON.parse(node.widgets_values[1]);
                    } catch (e) {
                        console.warn("Failed to parse loras data:", e);
                        existingLoras = [];
                    }
                }
                // Merge the loras data
                const mergedLoras = mergeLoras(node.widgets[0].value, existingLoras);
                 
                // Get the widget object directly from the returned object
                const result = addLorasWidget(node, "loras", {
                    defaultVal: mergedLoras  // Pass object directly
                }, (value) => {
                    // TODO
                });
                
                node.lorasWidget = result.widget;

                // get the input widget and set a callback
                const inputWidget = node.widgets[0];
                inputWidget.callback = (value) => {               
                    // Merge the loras data with widget value
                    const currentLoras = node.lorasWidget.value || [];
                    const mergedLoras = mergeLoras(value, currentLoras);
                    
                    node.lorasWidget.value = mergedLoras;
                };

                console.log("node: ", node);
            });
        }
    },

    async nodeRemoved(node) {
        if (node.comfyClass === "Lora Loader (LoraManager)") {
            // TODO: Remove widget from node
        }
    },
});