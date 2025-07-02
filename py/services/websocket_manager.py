import logging
from aiohttp import web
from typing import Set, Dict, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)

class WebSocketManager:
    """Manages WebSocket connections and broadcasts"""
    
    def __init__(self):
        self._websockets: Set[web.WebSocketResponse] = set()
        self._init_websockets: Set[web.WebSocketResponse] = set()  # New set for initialization progress clients
        self._download_websockets: Dict[str, web.WebSocketResponse] = {}  # New dict for download-specific clients
        
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
    
    async def handle_download_connection(self, request: web.Request) -> web.WebSocketResponse:
        """Handle new WebSocket connection for download progress"""
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        
        # Get download_id from query parameters
        download_id = request.query.get('id')
        
        if not download_id:
            # Generate a new download ID if not provided
            download_id = str(uuid4())
            logger.info(f"Created new download ID: {download_id}")
        else:
            logger.info(f"Using provided download ID: {download_id}")
        
        # Store the websocket with its download ID
        self._download_websockets[download_id] = ws
        
        try:
            # Send the download ID back to the client
            await ws.send_json({
                'type': 'download_id',
                'download_id': download_id
            })
            
            async for msg in ws:
                if msg.type == web.WSMsgType.ERROR:
                    logger.error(f'Download WebSocket error: {ws.exception()}')
        finally:
            if download_id in self._download_websockets:
                del self._download_websockets[download_id]
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
    
    async def broadcast_download_progress(self, download_id: str, data: Dict):
        """Send progress update to specific download client"""
        if download_id not in self._download_websockets:
            logger.debug(f"No WebSocket found for download ID: {download_id}")
            return
            
        ws = self._download_websockets[download_id]
        try:
            await ws.send_json(data)
        except Exception as e:
            logger.error(f"Error sending download progress: {e}")
            
    def get_connected_clients_count(self) -> int:
        """Get number of connected clients"""
        return len(self._websockets)

    def get_init_clients_count(self) -> int:
        """Get number of initialization progress clients"""
        return len(self._init_websockets)
        
    def get_download_clients_count(self) -> int:
        """Get number of download progress clients"""
        return len(self._download_websockets)
        
    def generate_download_id(self) -> str:
        """Generate a unique download ID"""
        return str(uuid4())

# Global instance
ws_manager = WebSocketManager()