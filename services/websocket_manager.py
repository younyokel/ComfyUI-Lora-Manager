import logging
from aiohttp import web
from typing import Set, Dict, Optional

logger = logging.getLogger(__name__)

class WebSocketManager:
    """Manages WebSocket connections and broadcasts"""
    
    def __init__(self):
        self._websockets: Set[web.WebSocketResponse] = set()
        
    async def handle_connection(self, request: web.Request) -> web.WebSocketResponse:
        """Handle new WebSocket connection"""
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        self._websockets.add(ws)
        
        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.ERROR:
                    logger.error(f'WebSocket error: {ws.exception()}')
        finally:
            self._websockets.discard(ws)
        return ws
        
    async def broadcast(self, data: Dict):
        """Broadcast message to all connected clients"""
        if not self._websockets:
            return
            
        for ws in self._websockets:
            try:
                await ws.send_json(data)
            except Exception as e:
                logger.error(f"Error sending progress: {e}")
                
    def get_connected_clients_count(self) -> int:
        """Get number of connected clients"""
        return len(self._websockets)

# Global instance
ws_manager = WebSocketManager() 