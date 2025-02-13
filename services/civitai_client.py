import aiohttp
import os
import json
import logging
from email.parser import Parser
from typing import Optional, Dict, Tuple
from urllib.parse import unquote

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
            connector = aiohttp.TCPConnector(ssl=True)
            trust_env = True  # 允许使用系统环境变量中的代理设置
            self._session = aiohttp.ClientSession(connector=connector, trust_env=trust_env)
        return self._session

    def _parse_content_disposition(self, header: str) -> str:
        """Parse filename from content-disposition header"""
        if not header:
            return None
        
        # Handle quoted filenames
        if 'filename="' in header:
            start = header.index('filename="') + 10
            end = header.index('"', start)
            return unquote(header[start:end])
        
        # Fallback to original parsing
        disposition = Parser().parsestr(f'Content-Disposition: {header}')
        filename = disposition.get_param('filename')
        if filename:
            return unquote(filename)
        return None

    def _get_request_headers(self) -> dict:
        """Get request headers with optional API key"""
        headers = {
            'User-Agent': 'ComfyUI-LoRA-Manager/1.0',
            'Content-Type': 'application/json'
        }
        
        from .settings_manager import settings
        api_key = settings.get('civitai_api_key')
        if (api_key):
            headers['Authorization'] = f'Bearer {api_key}'
            
        return headers

    async def _download_file(self, url: str, save_dir: str, default_filename: str) -> Tuple[bool, str]:
        """Download file with content-disposition support"""
        session = await self.session
        try:
            headers = self._get_request_headers()
            async with session.get(url, headers=headers, allow_redirects=True) as response:
                if response.status != 200:
                    return False, f"Download failed with status {response.status}"

                # Get filename from content-disposition header
                content_disposition = response.headers.get('Content-Disposition')
                filename = self._parse_content_disposition(content_disposition)
                if not filename:
                    filename = default_filename
                
                save_path = os.path.join(save_dir, filename)
                
                # Stream download to file
                with open(save_path, 'wb') as f:
                    while True:
                        chunk = await response.content.read(8192)
                        if not chunk:
                            break
                        f.write(chunk)
                        
                return True, save_path
                
        except Exception as e:
            logger.error(f"Download error: {e}")
            return False, str(e)

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

    async def download_model_with_info(self, download_url: str, version_info: dict, save_dir: str) -> Dict:
        """Download model using provided version info and URL"""
        try:
            # Generate default filename
            default_filename = f"lora_{version_info['id']}.safetensors"
            logger.info(f"Downloading model: {version_info.get('name', 'Unknown')}")
            
            # Download the model file
            success, result = await self._download_file(download_url, save_dir, default_filename)
            if not success:
                return {'success': False, 'error': result}
                
            save_path = result

            # Create metadata file
            metadata_path = os.path.splitext(save_path)[0] + '.metadata.json'
            metadata = {
                'model_name': version_info.get('name', os.path.basename(save_path)),
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
                metadata['preview_url'] = preview_path.replace(os.sep, '/')

            # Save metadata
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)

            return {
                'success': True,
                'file_path': save_path.replace(os.sep, '/'),
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