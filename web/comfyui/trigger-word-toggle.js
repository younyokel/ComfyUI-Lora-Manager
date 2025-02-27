import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { addTagsWidget } from "./lm_widgets.js";
import { hideWidgetForGood } from "./utils.js";

// TriggerWordToggle extension for ComfyUI
app.registerExtension({
    name: "LoraManager.TriggerWordToggle",
    
    setup() {
        // Add message handler to listen for messages from Python
        api.addEventListener("trigger_word_update", (event) => {
            const { id, message } = event.detail;
            this.handleTriggerWordUpdate(id, message);
        });
    },
    
    async nodeCreated(node) {
        if (node.comfyClass === "TriggerWord Toggle (LoraManager)") {
            // Enable widget serialization
            node.serialize_widgets = true;

            // Wait for node to be properly initialized
            requestAnimationFrame(() => {
                // add a hidden widget for excluded trigger words to send to Python
                node.hiddenWidget = node.addWidget("text", "hidden_trigger_words", "", (value) => {
                    // empty callback
                });
                hideWidgetForGood(node, node.hiddenWidget);
                 
                // Get the widget object directly from the returned object
                const result = addTagsWidget(node, "trigger_words", {
                    defaultVal: "[]"
                }, (value) => {
                    // update value of hidden widget
                    node.hiddenWidget.value = value;
                });
                
                node.tagWidget = result.widget;

                // Restore saved value if exists
                if (node.widgets_values && node.widgets_values.length > 0) {
                    // 0 is input, 1 is hidden widget, 2 is tag widget
                    const savedValue = node.widgets_values[2];
                    if (savedValue) {
                        result.widget.value = savedValue;
                    }
                }
            });
        }
    },

    async nodeRemoved(node) {
        if (node.comfyClass === "TriggerWord Toggle (LoraManager)") {
            // TODO: Remove widget from node
        }
    },

    // Handle trigger word updates from Python
    handleTriggerWordUpdate(id, message) {
        const node = app.graph.getNodeById(+id);
        if (!node || node.comfyClass !== "TriggerWord Toggle (LoraManager)") {
            console.warn("Node not found or not a TriggerWordToggle:", id);
            return;
        }
        
        if (node.tagWidget) {
            // Use widget.value setter instead of setValue
            node.tagWidget.value = message;
        }
    },
});
