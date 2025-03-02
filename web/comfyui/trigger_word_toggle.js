import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { addTagsWidget } from "./tags_widget.js";

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
                // Get the widget object directly from the returned object
                const result = addTagsWidget(node, "toggle_trigger_words", {
                    defaultVal: []
                });
                
                node.tagWidget = result.widget;

                // Restore saved value if exists
                if (node.widgets_values && node.widgets_values.length > 0) {
                    // 0 is input, 1 is tag widget
                    const savedValue = node.widgets_values[1];
                    if (savedValue) {
                        result.widget.value = savedValue;
                    }
                }
            });
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
            // Convert comma-separated message to tag object format
            if (typeof message === 'string') {
                // Get existing tags to preserve active states
                const existingTags = node.tagWidget.value || [];
                
                // Create a map of existing tags and their active states
                const existingTagMap = {};
                existingTags.forEach(tag => {
                    existingTagMap[tag.text] = tag.active;
                });
                
                // Process the incoming message
                const tagArray = message
                    .split(',')
                    .map(word => word.trim())
                    .filter(word => word)
                    .map(word => ({
                        text: word,
                        // Keep previous active state if exists, otherwise default to true
                        active: existingTagMap[word] !== undefined ? existingTagMap[word] : true
                    }));
                
                node.tagWidget.value = tagArray;
            }
        }
    },
});
