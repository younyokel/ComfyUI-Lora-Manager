import logging
from aiohttp import web
from typing import Set, Dict, Optional

logger = logging.getLogger(__name__)

class WebSocketManager:
    """Manages WebSocket connections and broadcasts"""
    
    def __init__(self):
        self._websockets: Set[web.WebSocketResponse] = set()
        self._init_websockets: Set[web.WebSocketResponse] = set()  # New set for initialization progress clients
        self._checkpoint_websockets: Set[web.WebSocketResponse] = set()  # New set for checkpoint download progress
        
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
    
    async def handle_init_connection(self, request: web.Request) -> web.WebSocketResponse:
        """Handle new WebSocket connection for initialization progress"""
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        self._init_websockets.add(ws)
        
        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.ERROR:
                    logger.error(f'Init WebSocket error: {ws.exception()}')
        finally:
            self._init_websockets.discard(ws)
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
    
    async def broadcast_init_progress(self, data: Dict):
        """Broadcast initialization progress to connected clients"""
        if not self._init_websockets:
            return
            
        # Ensure data has all required fields
        if 'stage' not in data:
            data['stage'] = 'processing'
        if 'progress' not in data:
            data['progress'] = 0
        if 'details' not in data:
            data['details'] = 'Processing...'
            
        for ws in self._init_websockets:
            try:
                await ws.send_json(data)
            except Exception as e:
                logger.error(f"Error sending initialization progress: {e}")
    
    async def broadcast_checkpoint_progress(self, data: Dict):
        """Broadcast checkpoint download progress to connected clients"""
        if not self._checkpoint_websockets:
            return
            
        for ws in self._checkpoint_websockets:
            try:
                await ws.send_json(data)
            except Exception as e:
                logger.error(f"Error sending checkpoint progress: {e}")
                
    def get_connected_clients_count(self) -> int:
        """Get number of connected clients"""
        return len(self._websockets)

    def get_init_clients_count(self) -> int:
        """Get number of initialization progress clients"""
        return len(self._init_websockets)

    def get_checkpoint_clients_count(self) -> int:
        """Get number of checkpoint progress clients"""
        return len(self._checkpoint_websockets)

# Global instance
ws_manager = WebSocketManager()