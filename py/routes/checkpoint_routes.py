import jinja2
import logging
from aiohttp import web

from .base_model_routes import BaseModelRoutes
from ..services.checkpoint_service import CheckpointService
from ..services.service_registry import ServiceRegistry
from ..config import config
from ..services.settings_manager import settings

logger = logging.getLogger(__name__)

class CheckpointRoutes(BaseModelRoutes):
    """Checkpoint-specific route controller"""
    
    def __init__(self):
        """Initialize Checkpoint routes with Checkpoint service"""
        # Service will be initialized later via setup_routes
        self.service = None
        self.civitai_client = None
        self.template_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(config.templates_path),
            autoescape=True
        )
    
    async def initialize_services(self):
        """Initialize services from ServiceRegistry"""
        checkpoint_scanner = await ServiceRegistry.get_checkpoint_scanner()
        self.service = CheckpointService(checkpoint_scanner)
        self.civitai_client = await ServiceRegistry.get_civitai_client()
        
        # Initialize parent with the service
        super().__init__(self.service)
    
    def setup_routes(self, app: web.Application):
        """Setup Checkpoint routes"""
        # Schedule service initialization on app startup
        app.on_startup.append(lambda _: self.initialize_services())
        
        # Setup common routes with 'checkpoints' prefix
        super().setup_routes(app, 'checkpoints')
    
    def setup_specific_routes(self, app: web.Application, prefix: str):
        """Setup Checkpoint-specific routes"""
        # Checkpoint page route
        app.router.add_get('/checkpoints', self.handle_checkpoints_page)
        
        # Checkpoint-specific CivitAI integration
        app.router.add_get(f'/api/civitai/versions/{{model_id}}', self.get_civitai_versions_checkpoint)
        
        # Checkpoint info by name
        app.router.add_get(f'/api/{prefix}/info/{{name}}', self.get_checkpoint_info)
    
    async def handle_checkpoints_page(self, request: web.Request) -> web.Response:
        """Handle GET /checkpoints request"""
        try:
            # Check if the CheckpointScanner is initializing
            # It's initializing if the cache object doesn't exist yet,
            # OR if the scanner explicitly says it's initializing (background task running).
            is_initializing = (
                self.service.scanner._cache is None or
                (hasattr(self.service.scanner, '_is_initializing') and self.service.scanner._is_initializing)
            )

            if is_initializing:
                # If still initializing, return loading page
                template = self.template_env.get_template('checkpoints.html')
                rendered = template.render(
                    folders=[],  # Empty folder list
                    is_initializing=True,  # New flag
                    settings=settings,  # Pass settings to template
                    request=request  # Pass the request object to the template
                )
                
                logger.info("Checkpoints page is initializing, returning loading page")
            else:
                # Normal flow - get initialized cache data
                try:
                    cache = await self.service.scanner.get_cached_data(force_refresh=False)
                    template = self.template_env.get_template('checkpoints.html')
                    rendered = template.render(
                        folders=cache.folders,
                        is_initializing=False,
                        settings=settings,  # Pass settings to template
                        request=request  # Pass the request object to the template
                    )
                except Exception as cache_error:
                    logger.error(f"Error loading checkpoints cache data: {cache_error}")
                    # If getting cache fails, also show initialization page
                    template = self.template_env.get_template('checkpoints.html')
                    rendered = template.render(
                        folders=[],
                        is_initializing=True,
                        settings=settings,
                        request=request
                    )
                    logger.info("Checkpoints cache error, returning initialization page")
            
            return web.Response(
                text=rendered,
                content_type='text/html'
            )
        except Exception as e:
            logger.error(f"Error handling checkpoints request: {e}", exc_info=True)
            return web.Response(
                text="Error loading checkpoints page",
                status=500
            )
    
    async def get_checkpoint_info(self, request: web.Request) -> web.Response:
        """Get detailed information for a specific checkpoint by name"""
        try:
            name = request.match_info.get('name', '')
            checkpoint_info = await self.service.get_model_info_by_name(name)
            
            if checkpoint_info:
                return web.json_response(checkpoint_info)
            else:
                return web.json_response({"error": "Checkpoint not found"}, status=404)
                
        except Exception as e:
            logger.error(f"Error in get_checkpoint_info: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)
    
    async def get_civitai_versions_checkpoint(self, request: web.Request) -> web.Response:
        """Get available versions for a Civitai checkpoint model with local availability info"""
        try:
            model_id = request.match_info['model_id']
            response = await self.civitai_client.get_model_versions(model_id)
            if not response or not response.get('modelVersions'):
                return web.Response(status=404, text="Model not found")
            
            versions = response.get('modelVersions', [])
            model_type = response.get('type', '')
            
            # Check model type - should be Checkpoint
            if model_type.lower() != 'checkpoint':
                return web.json_response({
                    'error': f"Model type mismatch. Expected Checkpoint, got {model_type}"
                }, status=400)
            
            # Check local availability for each version
            for version in versions:
                # Find the primary model file (type="Model" and primary=true) in the files list
                model_file = next((file for file in version.get('files', []) 
                                  if file.get('type') == 'Model' and file.get('primary') == True), None)
                
                # If no primary file found, try to find any model file
                if not model_file:
                    model_file = next((file for file in version.get('files', []) 
                                      if file.get('type') == 'Model'), None)
                
                if model_file:
                    sha256 = model_file.get('hashes', {}).get('SHA256')
                    if sha256:
                        # Set existsLocally and localPath at the version level
                        version['existsLocally'] = self.service.has_hash(sha256)
                        if version['existsLocally']:
                            version['localPath'] = self.service.get_path_by_hash(sha256)
                        
                        # Also set the model file size at the version level for easier access
                        version['modelSizeKB'] = model_file.get('sizeKB')
                else:
                    # No model file found in this version
                    version['existsLocally'] = False
                    
            return web.json_response(versions)
        except Exception as e:
            logger.error(f"Error fetching checkpoint model versions: {e}")
            return web.Response(status=500, text=str(e))