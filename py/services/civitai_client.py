from datetime import datetime
import aiohttp
import os
import json
import logging
from email.parser import Parser
from typing import Optional, Dict, Tuple, List
from urllib.parse import unquote
from ..utils.models import LoraMetadata

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

    async def _download_file(self, url: str, save_dir: str, default_filename: str, progress_callback=None) -> Tuple[bool, str]:
        """Download file with content-disposition support and progress tracking

        Args:
            url: Download URL
            save_dir: Directory to save the file
            default_filename: Fallback filename if none provided in headers
            progress_callback: Optional async callback function for progress updates (0-100)

        Returns:
            Tuple[bool, str]: (success, save_path or error message)
        """
        session = await self.session
        try:
            headers = self._get_request_headers()
            async with session.get(url, headers=headers, allow_redirects=True) as response:
                if response.status != 200:
                    # Handle 401 unauthorized responses
                    if response.status == 401:
                        logger.warning(f"Unauthorized access to resource: {url} (Status 401)")
                        
                        return False, "Invalid or missing CivitAI API key, or early access restriction."
                    
                    # Handle other client errors that might be permission-related
                    if response.status == 403:
                        logger.warning(f"Forbidden access to resource: {url} (Status 403)")
                        return False, "Access forbidden: You don't have permission to download this file."
                    
                    # Generic error response for other status codes
                    return False, f"Download failed with status {response.status}"

                # Get filename from content-disposition header
                content_disposition = response.headers.get('Content-Disposition')
                filename = self._parse_content_disposition(content_disposition)
                if not filename:
                    filename = default_filename
                
                save_path = os.path.join(save_dir, filename)
                
                # Get total file size for progress calculation
                total_size = int(response.headers.get('content-length', 0))
                current_size = 0

                # Stream download to file with progress updates
                with open(save_path, 'wb') as f:
                    async for chunk in response.content.iter_chunked(8192):
                        if chunk:
                            f.write(chunk)
                            current_size += len(chunk)
                            if progress_callback and total_size:
                                progress = (current_size / total_size) * 100
                                await progress_callback(progress)
                
                # Ensure 100% progress is reported
                if progress_callback:
                    await progress_callback(100)
                        
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
            
    async def get_model_versions(self, model_id: str) -> List[Dict]:
        """Get all versions of a model with local availability info"""
        try:
            session = await self.session  # 等待获取 session
            async with session.get(f"{self.base_url}/models/{model_id}") as response:
                if response.status != 200:
                    return None
                data = await response.json()
                return data.get('modelVersions', [])
        except Exception as e:
            logger.error(f"Error fetching model versions: {e}")
            return None

    async def get_model_version_info(self, version_id: str) -> Optional[Dict]:
        """Fetch model version metadata from Civitai"""
        try:
            session = await self.session
            url = f"{self.base_url}/model-versions/{version_id}"
            headers = self._get_request_headers()
            
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    return await response.json()
                return None
        except Exception as e:
            logger.error(f"Error fetching model version info: {e}")
            return None

    async def get_model_metadata(self, model_id: str) -> Tuple[Optional[Dict], int]:
        """Fetch model metadata (description and tags) from Civitai API
        
        Args:
            model_id: The Civitai model ID
            
        Returns:
            Tuple[Optional[Dict], int]: A tuple containing:
                - A dictionary with model metadata or None if not found
                - The HTTP status code from the request
        """
        try:
            session = await self.session
            headers = self._get_request_headers()
            url = f"{self.base_url}/models/{model_id}"
            
            async with session.get(url, headers=headers) as response:
                status_code = response.status
                
                if status_code != 200:
                    logger.warning(f"Failed to fetch model metadata: Status {status_code}")
                    return None, status_code
                
                data = await response.json()
                
                # Extract relevant metadata
                metadata = {
                    "description": data.get("description") or "No model description available",
                    "tags": data.get("tags", [])
                }
                
                if metadata["description"] or metadata["tags"]:
                    return metadata, status_code
                else:
                    logger.warning(f"No metadata found for model {model_id}")
                    return None, status_code
                
        except Exception as e:
            logger.error(f"Error fetching model metadata: {e}", exc_info=True)
            return None, 0

    # Keep old method for backward compatibility, delegating to the new one
    async def get_model_description(self, model_id: str) -> Optional[str]:
        """Fetch the model description from Civitai API (Legacy method)"""
        metadata, _ = await self.get_model_metadata(model_id)
        return metadata.get("description") if metadata else None

    async def close(self):
        """Close the session if it exists"""
        if self._session is not None:
            await self._session.close()
            self._session = None

    async def _get_hash_from_civitai(self, model_version_id: str) -> Optional[str]:
        """Get hash from Civitai API"""
        try:
            if not self._session:
                return None
            
            logger.info(f"Fetching model version info from Civitai for ID: {model_version_id}")
            version_info = await self._session.get(f"{self.base_url}/model-versions/{model_version_id}")
            
            if not version_info or not version_info.json().get('files'):
                logger.warning(f"No files found in version info for ID: {model_version_id}")
                return None
            
            # Get hash from the first file
            for file_info in version_info.json().get('files', []):
                if file_info.get('hashes', {}).get('SHA256'):
                    # Convert hash to lowercase to standardize
                    hash_value = file_info['hashes']['SHA256'].lower()
                    return hash_value
                
            logger.warning(f"No SHA256 hash found in version info for ID: {model_version_id}")
            return None
        except Exception as e:
            logger.error(f"Error getting hash from Civitai: {e}")
            return None
