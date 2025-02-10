import aiohttp
import os
import json
import logging
from typing import Optional, Dict

logger = logging.getLogger(__name__)

class CivitaiClient:
    def __init__(self):
        self.base_url = "https://civitai.com/api/v1"
        self.headers = {
            'User-Agent': 'ComfyUI-LoRA-Manager/1.0'
        }
        self._session = None
    
    @property
    async def session(self) -> aiohttp.ClientSession:
        """Lazy initialize the session"""
        if self._session is None:
            self._session = aiohttp.ClientSession()
        return self._session

    async def get_model_by_hash(self, model_hash: str) -> Optional[Dict]:
        try:
            session = await self.session
            async with session.get(f"{self.base_url}/model-versions/by-hash/{model_hash}") as response:
                if response.status == 200:
                    return await response.json()
                return None
        except Exception as e:
            logger.error(f"API Error: {str(e)}")
            return None

    async def download_preview_image(self, image_url: str, save_path: str):
        try:
            session = await self.session
            async with session.get(image_url) as response:
                if response.status == 200:
                    content = await response.read()
                    with open(save_path, 'wb') as f:
                        f.write(content)
                    return True
                return False
        except Exception as e:
            print(f"Download Error: {str(e)}")
            return False
            
    async def get_model_versions(self, model_id: str) -> Optional[Dict]:
        """Fetch all versions of a model"""
        try:
            session = await self.session
            url = f"{self.base_url}/models/{model_id}"
            async with session.get(url, headers=self.headers) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get('modelVersions', [])
                return None
        except Exception as e:
            logger.error(f"Error fetching model versions: {e}")
            return None

    async def download_model_version(self, version_id: str, save_dir: str) -> Dict:
        """Download a specific model version"""
        try:
            session = await self.session
            # First get version info
            url = f"{self.base_url}/model-versions/{version_id}"
            async with session.get(url, headers=self.headers) as response:
                if response.status != 200:
                    return {'success': False, 'error': 'Version not found'}
                
                version_data = await response.json()
                download_url = version_data.get('downloadUrl')
                if not download_url:
                    return {'success': False, 'error': 'No download URL found'}

            # Download the file
            file_name = version_data.get('files', [{}])[0].get('name', f'lora_{version_id}.safetensors')
            save_path = os.path.join(save_dir, file_name)
            
            async with session.get(download_url, headers=self.headers) as response:
                if response.status != 200:
                    return {'success': False, 'error': 'Download failed'}
                
                with open(save_path, 'wb') as f:
                    while True:
                        chunk = await response.content.read(8192)
                        if not chunk:
                            break
                        f.write(chunk)

            # Create metadata file
            metadata_path = os.path.splitext(save_path)[0] + '.metadata.json'
            metadata = {
                'model_name': version_data.get('model', {}).get('name', file_name),
                'civitai': version_data,
                'preview_url': None,
                'from_civitai': True
            }

            # Download preview image if available
            images = version_data.get('images', [])
            if images:
                preview_ext = '.mp4' if images[0].get('type') == 'video' else '.png'
                preview_path = os.path.splitext(save_path)[0] + '.preview' + preview_ext
                await self.download_preview_image(images[0]['url'], preview_path)
                metadata['preview_url'] = preview_path

            # Save metadata
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)

            return {
                'success': True,
                'file_path': save_path,
                'metadata': metadata
            }

        except Exception as e:
            logger.error(f"Error downloading model version: {e}")
            return {'success': False, 'error': str(e)}

    async def download_model_with_info(self, download_url: str, version_info: dict, save_dir: str) -> Dict:
        """Download model using provided version info and URL"""
        try:
            session = await self.session
            
            # Use provided filename or generate one
            file_name = version_info.get('files', [{}])[0].get('name', f'lora_{version_info["id"]}.safetensors')
            save_path = os.path.join(save_dir, file_name)
            
            # Download the file
            async with session.get(download_url, headers=self.headers) as response:
                if response.status != 200:
                    return {'success': False, 'error': 'Download failed'}
                
                with open(save_path, 'wb') as f:
                    while True:
                        chunk = await response.content.read(8192)
                        if not chunk:
                            break
                        f.write(chunk)

            # Create metadata file
            metadata_path = os.path.splitext(save_path)[0] + '.metadata.json'
            metadata = {
                'model_name': version_info.get('model', {}).get('name', file_name),
                'civitai': version_info,
                'preview_url': None,
                'from_civitai': True
            }

            # Download preview image if available
            images = version_info.get('images', [])
            if images:
                preview_ext = '.mp4' if images[0].get('type') == 'video' else '.png'
                preview_path = os.path.splitext(save_path)[0] + '.preview' + preview_ext
                await self.download_preview_image(images[0]['url'], preview_path)
                metadata['preview_url'] = preview_path

            # Save metadata
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)

            return {
                'success': True,
                'file_path': save_path,
                'metadata': metadata
            }

        except Exception as e:
            logger.error(f"Error downloading model version: {e}")
            return {'success': False, 'error': str(e)}

    async def close(self):
        """Close the session if it exists"""
        if self._session is not None:
            await self._session.close()
            self._session = None