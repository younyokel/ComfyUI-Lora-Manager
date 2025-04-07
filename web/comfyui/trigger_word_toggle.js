import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const CONVERTED_TYPE = 'converted-widget'

function getComfyUIFrontendVersion() {
    // 直接访问全局变量
    return window['__COMFYUI_FRONTEND_VERSION__'];
}

// Dynamically import the appropriate tags widget based on app version
function getTagsWidgetModule() {
    // Parse app version and compare with 1.12.6
    const currentVersion = getComfyUIFrontendVersion() || "0.0.0";
    console.log("currentVersion", currentVersion);
    const versionParts = currentVersion.split('.').map(part => parseInt(part, 10));
    const requiredVersion = [1, 12, 6];
    
    // Compare version numbers
    for (let i = 0; i < 3; i++) {
        if (versionParts[i] > requiredVersion[i]) {
            console.log("Using tags_widget.js");
            return import("./tags_widget.js");
        } else if (versionParts[i] < requiredVersion[i]) {
            console.log("Using legacy_tags_widget.js");
            return import("./legacy_tags_widget.js");
        }
    }
    
    // If we get here, versions are equal, use the new module
    return import("./tags_widget.js");
}

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
            
            node.addInput("trigger_words", 'string', {
                "shape": 7  // 7 is the shape of the optional input
            });

            // Wait for node to be properly initialized
            requestAnimationFrame(async () => {
                // Dynamically import the appropriate tags widget module
                const tagsWidgetModule = await getTagsWidgetModule();
                const { addTagsWidget } = tagsWidgetModule;
                
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
                    const savedValue = node.widgets_values[1];
                    if (savedValue) {
                        result.widget.value = savedValue;
                    }
                    const originalMessage = node.widgets_values[2];
                    if (originalMessage) {
                        hiddenWidget.value = originalMessage;
                    }
                }

                const groupModeWidget = node.widgets[0];
                groupModeWidget.callback = (value) => {
                    if (node.widgets[2].value) {
                        this.updateTagsBasedOnMode(node, node.widgets[2].value, value);
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
        node.widgets[2].value = message;

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
