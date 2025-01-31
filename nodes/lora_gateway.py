class LoRAGateway:
    """
    LoRA Gateway Node
    Acts as the entry point for LoRA management services
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {}
        }

    RETURN_TYPES = ()
    FUNCTION = "register_services"
    CATEGORY = "LoRA Management"