import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { addTagsWidget } from "./tags_widget.js";

const CONVERTED_TYPE = 'converted-widget'

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

                // Add hidden widget to store original message
                const hiddenWidget = node.addWidget('text', 'orinalMessage', '');
                hiddenWidget.type = CONVERTED_TYPE;
                hiddenWidget.hidden = true;
                hiddenWidget.computeSize = () => [0, -4];

                // Restore saved value if exists
                if (node.widgets_values && node.widgets_values.length > 0) {
                    // 0 is group mode, 1 is input, 2 is tag widget, 3 is original message
                    const savedValue = node.widgets_values[2];
                    if (savedValue) {
                        result.widget.value = savedValue;
                    }
                    const originalMessage = node.widgets_values[3];
                    if (originalMessage) {
                        hiddenWidget.value = originalMessage;
                    }
                }

                const groupModeWidget = node.widgets[0];
                groupModeWidget.callback = (value) => {
                    if (node.widgets[3].value) {
                        this.updateTagsBasedOnMode(node, node.widgets[3].value, value);
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
        
        // Store the original message for mode switching
        node.widgets[3].value = message;

        if (node.tagWidget) {
            // Parse tags based on current group mode
            const groupMode = node.widgets[0] ? node.widgets[0].value : false;
            this.updateTagsBasedOnMode(node, message, groupMode);
        }
    },
    
    // Update tags display based on group mode
    updateTagsBasedOnMode(node, message, groupMode) {
        if (!node.tagWidget) return;
        
        const existingTags = node.tagWidget.value || [];
        const existingTagMap = {};
        
        // Create a map of existing tags and their active states
        existingTags.forEach(tag => {
            existingTagMap[tag.text] = tag.active;
        });
        
        let tagArray = [];
        
        if (groupMode) {
            if (message.trim() === '') {
                tagArray = [];
            }
            // Group mode: split by ',,' and treat each group as a single tag
            else if (message.includes(',,')) {
                const groups = message.split(/,{2,}/); // Match 2 or more consecutive commas
                tagArray = groups
                    .map(group => group.trim())
                    .filter(group => group)
                    .map(group => ({
                        text: group,
                        active: existingTagMap[group] !== undefined ? existingTagMap[group] : true
                    }));
            } else {
                // If no ',,' delimiter, treat the entire message as one group
                tagArray = [{
                    text: message.trim(),
                    active: existingTagMap[message.trim()] !== undefined ? existingTagMap[message.trim()] : true
                }];
            }
        } else {
            // Normal mode: split by commas and treat each word as a separate tag
            tagArray = message
                .split(',')
                .map(word => word.trim())
                .filter(word => word)
                .map(word => ({
                    text: word,
                    active: existingTagMap[word] !== undefined ? existingTagMap[word] : true
                }));
        }
        
        node.tagWidget.value = tagArray;
    }
});
