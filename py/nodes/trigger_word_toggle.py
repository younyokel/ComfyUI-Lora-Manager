import json
from server import PromptServer # type: ignore
from .utils import FlexibleOptionalInputType, any_type

class TriggerWordToggle:
    NAME = "TriggerWord Toggle (LoraManager)"
    CATEGORY = "lora manager"
    DESCRIPTION = "Toggle trigger words on/off"
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "trigger_words": ("STRING", {"defaultInput": True, "forceInput": True}),
            },
            "optional": FlexibleOptionalInputType(any_type),
            "hidden": {
                "id": "UNIQUE_ID",  # 会被 ComfyUI 自动替换为唯一ID
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("filtered_trigger_words",)
    FUNCTION = "process_trigger_words"

    def process_trigger_words(self, trigger_words, id, **kwargs):
        # Send trigger words to frontend
        PromptServer.instance.send_sync("trigger_word_update", {
            "id": id,
            "message": trigger_words
        })
        
        filtered_triggers = trigger_words
        
        if 'toggle_trigger_words' in kwargs:
            try:
                # Get trigger word toggle data
                trigger_data = kwargs['toggle_trigger_words']
                
                # Convert to list if it's a JSON string
                if isinstance(trigger_data, str):
                    trigger_data = json.loads(trigger_data)
                
                # Create dictionaries to track active state of words
                active_state = {item['text']: item.get('active', False) for item in trigger_data}
                
                # Split original trigger words
                original_words = [word.strip() for word in trigger_words.split(',')]
                
                # Filter words: keep those not in toggle_trigger_words or those that are active
                filtered_words = [word for word in original_words if word not in active_state or active_state[word]]
                
                # Join them in the same format as input
                if filtered_words:
                    filtered_triggers = ', '.join(filtered_words)
                else:
                    filtered_triggers = ""
                    
            except Exception as e:
                print(f"Error processing trigger words: {e}")
            
        return (filtered_triggers,)