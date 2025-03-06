import os
import aiohttp
import logging
import toml
from aiohttp import web
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class UpdateRoutes:
    """Routes for handling plugin update checks"""
    
    @staticmethod
    def setup_routes(app):
        """Register update check routes"""
        app.router.add_get('/loras/api/check-updates', UpdateRoutes.check_updates)
    
    @staticmethod
    async def check_updates(request):
        """
        Check for plugin updates by comparing local version with GitHub
        Returns update status and version information
        """
        try:
            # Read local version from pyproject.toml
            local_version = UpdateRoutes._get_local_version()
            logger.info(f"Local version: {local_version}")
            
            # Fetch remote version from GitHub
            remote_version, changelog = await UpdateRoutes._get_remote_version()
            logger.info(f"Remote version: {remote_version}")
            
            # Compare versions
            update_available = UpdateRoutes._compare_versions(
                local_version.replace('v', ''), 
                remote_version.replace('v', '')
            )
            
            logger.info(f"Update available: {update_available}")
            
            return web.json_response({
                'success': True,
                'current_version': local_version,
                'latest_version': remote_version,
                'update_available': update_available,
                'changelog': changelog
            })
            
        except Exception as e:
            logger.error(f"Failed to check for updates: {e}", exc_info=True)
            return web.json_response({
                'success': False,
                'error': str(e)
            })
    
    @staticmethod
    def _get_local_version() -> str:
        """Get local plugin version from pyproject.toml"""
        try:
            # Find the plugin's pyproject.toml file
            current_dir = os.path.dirname(os.path.abspath(__file__))
            plugin_root = os.path.dirname(os.path.dirname(current_dir))
            pyproject_path = os.path.join(plugin_root, 'pyproject.toml')
            
            # Read and parse the toml file
            if os.path.exists(pyproject_path):
                with open(pyproject_path, 'r', encoding='utf-8') as f:
                    project_data = toml.load(f)
                    version = project_data.get('project', {}).get('version', '0.0.0')
                    return f"v{version}"
            else:
                logger.warning(f"pyproject.toml not found at {pyproject_path}")
                return "v0.0.0"
        
        except Exception as e:
            logger.error(f"Failed to get local version: {e}", exc_info=True)
            return "v0.0.0"
    
    @staticmethod
    async def _get_remote_version() -> tuple[str, List[str]]:
        """
        Fetch remote version from GitHub
        Returns:
            tuple: (version string, changelog list)
        """
        repo_owner = "willmiao"
        repo_name = "ComfyUI-Lora-Manager"
        
        # Use GitHub API to fetch the latest release
        github_url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/releases/latest"
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(github_url, headers={'Accept': 'application/vnd.github+json'}) as response:
                    if response.status != 200:
                        logger.warning(f"Failed to fetch GitHub release: {response.status}")
                        return "v0.0.0", []
                    
                    data = await response.json()
                    version = data.get('tag_name', '')
                    if not version.startswith('v'):
                        version = f"v{version}"
                    
                    # Extract changelog from release notes
                    body = data.get('body', '')
                    changelog = UpdateRoutes._parse_changelog(body)
                    
                    return version, changelog
        
        except Exception as e:
            logger.error(f"Error fetching remote version: {e}", exc_info=True)
            return "v0.0.0", []
    
    @staticmethod
    def _parse_changelog(release_notes: str) -> List[str]:
        """
        Parse GitHub release notes to extract changelog items
        
        Args:
            release_notes: GitHub release notes markdown text
            
        Returns:
            List of changelog items
        """
        changelog = []
        
        # Simple parsing - extract bullet points
        lines = release_notes.split('\n')
        for line in lines:
            line = line.strip()
            # Look for bullet points or numbered items
            if line.startswith('- ') or line.startswith('* '):
                item = line[2:].strip()
                if item:
                    changelog.append(item)
            # Match numbered items like "1. Item"
            elif len(line) > 2 and line[0].isdigit() and line[1:].startswith('. '):
                item = line[line.index('. ')+2:].strip()
                if item:
                    changelog.append(item)
        
        # If we couldn't parse specific items, use the whole text (limited)
        if not changelog and release_notes:
            # Limit to first 500 chars and add ellipsis
            summary = release_notes.strip()[:500]
            if len(release_notes) > 500:
                summary += "..."
            changelog.append(summary)
            
        return changelog
    
    @staticmethod
    def _compare_versions(version1: str, version2: str) -> bool:
        """
        Compare two semantic version strings
        Returns True if version2 is newer than version1
        """
        try:
            # Split versions into components
            v1_parts = [int(x) for x in version1.split('.')]
            v2_parts = [int(x) for x in version2.split('.')]
            
            # Ensure both have 3 components (major.minor.patch)
            while len(v1_parts) < 3:
                v1_parts.append(0)
            while len(v2_parts) < 3:
                v2_parts.append(0)
            
            # Compare version components
            for i in range(3):
                if v2_parts[i] > v1_parts[i]:
                    return True
                elif v2_parts[i] < v1_parts[i]:
                    return False
            
            # Versions are equal
            return False
        except Exception as e:
            logger.error(f"Error comparing versions: {e}", exc_info=True)
            return False
