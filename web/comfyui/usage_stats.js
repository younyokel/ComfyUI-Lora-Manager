// ComfyUI extension to track model usage statistics
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Register the extension
app.registerExtension({
    name: "LoraManager.UsageStats",
    
    setup() {
        // Listen for successful executions
        api.addEventListener("execution_success", ({ detail }) => {
            if (detail && detail.prompt_id) {
                this.updateUsageStats(detail.prompt_id);
            }
        });
    },
    
    async updateUsageStats(promptId) {
        try {
            // Call backend endpoint with the prompt_id
            const response = await fetch(`/api/update-usage-stats`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompt_id: promptId }),
            });
            
            if (!response.ok) {
                console.warn("Failed to update usage statistics:", response.statusText);
            }
        } catch (error) {
            console.error("Error updating usage statistics:", error);
        }
    }
});
