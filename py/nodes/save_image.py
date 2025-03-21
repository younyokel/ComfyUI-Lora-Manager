import json
from server import PromptServer # type: ignore

class SaveImage:
    NAME = "Save Image (LoraManager)"
    CATEGORY = "Lora Manager/utils"
    DESCRIPTION = "Experimental node to display image preview and print prompt and extra_pnginfo"
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "process_image"

    def process_image(self, image, prompt=None, extra_pnginfo=None):
        # Print the prompt information
        print("SaveImage Node - Prompt:")
        if prompt:
            print(json.dumps(prompt, indent=2))
        else:
            print("No prompt information available")
        
        # Print the extra_pnginfo
        print("\nSaveImage Node - Extra PNG Info:")
        if extra_pnginfo:
            print(json.dumps(extra_pnginfo, indent=2))
        else:
            print("No extra PNG info available")
        
        # Return the image unchanged
        return (image,)
