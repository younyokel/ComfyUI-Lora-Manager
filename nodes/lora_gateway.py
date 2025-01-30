from ..lora_manager import LorasEndpoint


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

    @classmethod
    def register_services(cls):
        # Service registration logic
        LorasEndpoint.add_routes()
        return ()