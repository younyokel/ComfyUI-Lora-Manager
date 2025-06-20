import os
import aiohttp
import logging
import toml
import subprocess
from datetime import datetime
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
            
            # Get git info (commit hash, branch)
            git_info = UpdateRoutes._get_git_info()

            # Fetch remote version from GitHub
            remote_version, changelog = await UpdateRoutes._get_remote_version()
            
            # Compare versions
            update_available = UpdateRoutes._compare_versions(
                local_version.replace('v', ''), 
                remote_version.replace('v', '')
            )
            
            return web.json_response({
                'success': True,
                'current_version': local_version,
                'latest_version': remote_version,
                'update_available': update_available,
                'changelog': changelog,
                'git_info': git_info
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
    def _get_git_info() -> Dict[str, str]:
        """Get Git repository information"""
        current_dir = os.path.dirname(os.path.abspath(__file__))
        plugin_root = os.path.dirname(os.path.dirname(current_dir))
        
        git_info = {
            'commit_hash': 'unknown',
            'short_hash': 'unknown',
            'branch': 'unknown',
            'commit_date': 'unknown'
        }
        
        try:
            # Check if we're in a git repository
            if not os.path.exists(os.path.join(plugin_root, '.git')):
                return git_info
                
            # Get current commit hash
            result = subprocess.run(
                ['git', 'rev-parse', 'HEAD'],
                cwd=plugin_root,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False
            )
            if result.returncode == 0:
                git_info['commit_hash'] = result.stdout.strip()
                git_info['short_hash'] = git_info['commit_hash'][:7]
            
            # Get current branch name
            result = subprocess.run(
                ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
                cwd=plugin_root,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False
            )
            if result.returncode == 0:
                git_info['branch'] = result.stdout.strip()
            
            # Get commit date
            result = subprocess.run(
                ['git', 'show', '-s', '--format=%ci', 'HEAD'],
                cwd=plugin_root,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False
            )
            if result.returncode == 0:
                commit_date = result.stdout.strip()
                # Format the date nicely if possible
                try:
                    date_obj = datetime.strptime(commit_date, '%Y-%m-%d %H:%M:%S %z')
                    git_info['commit_date'] = date_obj.strftime('%Y-%m-%d')
                except:
                    git_info['commit_date'] = commit_date
                    
        except Exception as e:
            logger.warning(f"Error getting git info: {e}")
            
        return git_info
    
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
        Ignores any suffixes after '-' (e.g., -bugfix, -alpha)
        """
        try:
            # Clean version strings - remove any suffix after '-'
            v1_clean = version1.split('-')[0]
            v2_clean = version2.split('-')[0]
            
            # Split versions into components
            v1_parts = [int(x) for x in v1_clean.split('.')]
            v2_parts = [int(x) for x in v2_clean.split('.')]
            
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
