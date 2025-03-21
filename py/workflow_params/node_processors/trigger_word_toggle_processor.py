from typing import Dict, Any, List
from .base_processor import NodeProcessor, register_processor

@register_processor
class TriggerWordToggleProcessor(NodeProcessor):
    """Processor for TriggerWord Toggle (LoraManager) nodes"""
    
    NODE_CLASS_TYPE = "TriggerWord Toggle (LoraManager)"
    REQUIRED_FIELDS = {"toggle_trigger_words", "group_mode"}
    
    def process(self, workflow_parser) -> Dict[str, Any]:
        """Process a TriggerWord Toggle node to extract active trigger words"""
        if "toggle_trigger_words" not in self.inputs:
            return None
            
        toggle_words = self.inputs["toggle_trigger_words"]
        if not isinstance(toggle_words, list):
            return None
            
        # Filter active trigger words that aren't dummy items
        active_words = []
        for word_entry in toggle_words:
            if (isinstance(word_entry, dict) and 
                word_entry.get("active", False) and 
                not word_entry.get("_isDummy", False) and
                "text" in word_entry):
                active_words.append(word_entry["text"])
        
        if not active_words:
            return None
            
        # Join all active trigger words with a comma
        return ", ".join(active_words) 