import aiohttp
import os
import json
from typing import Optional, Dict

class CivitaiClient:
    def __init__(self):
        self.base_url = "https://civitai.com/api/v1"
        self.session = aiohttp.ClientSession()
        
    async def get_model_by_hash(self, model_hash: str) -> Optional[Dict]:
        try:
            async with self.session.get(f"{self.base_url}/model-versions/by-hash/{model_hash}") as response:
                if response.status == 200:
                    return await response.json()
                return None
        except Exception as e:
            print(f"API Error: {str(e)}")
            return None

    async def download_preview_image(self, image_url: str, save_path: str):
        try:
            async with self.session.get(image_url) as response:
                if response.status == 200:
                    content = await response.read()
                    with open(save_path, 'wb') as f:
                        f.write(content)
                    return True
                return False
        except Exception as e:
            print(f"Download Error: {str(e)}")
            return False
            
    async def close(self):
        await self.session.close()