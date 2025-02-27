from server import PromptServer # type: ignore
from .utils import FlexibleOptionalInputType, any_type
import json

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
        
        if 'hidden_trigger_words' in kwargs:
            try:
                # Parse the hidden trigger words JSON
                trigger_data = json.loads(kwargs['hidden_trigger_words']) if isinstance(kwargs['hidden_trigger_words'], str) else kwargs['hidden_trigger_words']
                
                # Create dictionaries to track active state of words
                active_state = {item['text']: item.get('active', False) for item in trigger_data}
                
                # Split original trigger words
                original_words = [word.strip() for word in trigger_words.split(',')]
                
                # Filter words: keep those not in hidden_trigger_words or those that are active
                filtered_words = [word for word in original_words if word not in active_state or active_state[word]]
                
                # Join them in the same format as input
                if filtered_words:
                    filtered_triggers = ', '.join(filtered_words)
                else:
                    filtered_triggers = ""
                    
            except Exception as e:
                print(f"Error processing trigger words: {e}")
        
        for key, value in kwargs.items():
            print(f"{key}: {value}")
            
        return (filtered_triggers,)