from aiohttp import web
from server import PromptServer
from .nodes.utils import get_lora_info

@PromptServer.instance.routes.post("/loramanager/get_trigger_words")
async def get_trigger_words(request):
    json_data = await request.json()
    lora_names = json_data.get("lora_names", [])
    node_ids = json_data.get("node_ids", [])
    
    all_trigger_words = []
    for lora_name in lora_names:
        _, trigger_words = await get_lora_info(lora_name)
        all_trigger_words.extend(trigger_words)
    
    # Format the trigger words
    trigger_words_text = ",, ".join(all_trigger_words) if all_trigger_words else ""
    
    # Send update to all connected trigger word toggle nodes
    for node_id in node_ids:
        PromptServer.instance.send_sync("trigger_word_update", {
            "id": node_id,
            "message": trigger_words_text
        })
    
    return web.json_response({"success": True})
