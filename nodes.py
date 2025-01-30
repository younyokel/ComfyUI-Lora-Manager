import os
import json
import time
from pathlib import Path
from aiohttp import web
from server import PromptServer
import jinja2
from safetensors import safe_open
from .utils.file_utils import get_file_info, save_metadata, load_metadata, update_civitai_metadata
from .utils.lora_metadata import extract_lora_metadata
from typing import Dict, Optional
from .services.civitai_client import CivitaiClient
import folder_paths

class LorasEndpoint:
    def __init__(self):
        self.template_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(
                os.path.join(os.path.dirname(__file__), 'templates')
            ),
            autoescape=True
        )
        # Configure Loras root directories (from ComfyUI folder paths settings)
        self.loras_roots = [path.replace(os.sep, "/") for path in folder_paths.get_folder_paths("loras") if os.path.exists(path)]
        if not self.loras_roots:
            raise ValueError("No valid loras folders found")
        print(f"Loras roots: {self.loras_roots}") # debug log
        
        self.server = PromptServer.instance

    @classmethod
    def add_routes(cls):
        instance = cls()
        app = PromptServer.instance.app
        static_path = os.path.join(os.path.dirname(__file__), 'static')

        # Generate multiple static paths based on the number of folders in instance.loras_roots
        for idx, root in enumerate(instance.loras_roots, start=1):
            # Create different static paths for each folder, like /loras_static/root1/preview
            preview_path = f'/loras_static/root{idx}/preview'
            app.add_routes([web.static(preview_path, root)])

        app.add_routes([
            web.get('/loras', instance.handle_loras_request),
            # web.static('/loras_static/previews', instance.loras_root),
            web.static('/loras_static', static_path),
            web.post('/api/delete_model', instance.delete_model),
            web.post('/api/fetch-civitai', instance.fetch_civitai),
            web.post('/api/replace_preview', instance.replace_preview),
        ])
    

    async def scan_loras(self):
        loras = []
        for loras_root in self.loras_roots:
            for root, _, files in os.walk(loras_root):
                safetensors_files = [f for f in files if f.endswith('.safetensors')]
                
                for filename in safetensors_files:
                    file_path = os.path.join(root, filename).replace(os.sep, "/")
                    
                    # Try to load existing metadata first
                    metadata = await load_metadata(file_path)
                    
                    if metadata is None:
                        # Only get file info and extract metadata if no existing metadata
                        metadata = await get_file_info(file_path)
                        base_model_info = await extract_lora_metadata(file_path)
                        metadata.base_model = base_model_info['base_model']
                        await save_metadata(file_path, metadata)
                    
                    # Convert to dict for API response
                    lora_data = metadata.to_dict()
                    # Get relative path and remove filename to get just the folder structure
                    rel_path = os.path.relpath(file_path, loras_root)
                    folder = os.path.dirname(rel_path)
                    # Ensure forward slashes for consistency across platforms
                    lora_data['folder'] = folder.replace(os.path.sep, '/')
                    
                    loras.append(lora_data)
            
        return loras


    def clean_description(self, desc):
        """清理HTML格式的描述"""
        return desc.replace("<p>", "").replace("</p>", "\n").strip()

    async def handle_loras_request(self, request):
        """处理Loras请求并渲染模板"""
        try:
            scan_start = time.time()
            data = await self.scan_loras()
            print(f"Lora Manager: Scanned {len(data)} loras in {time.time()-scan_start:.2f}s")
            
            # Format the data for the template
            formatted_loras = [self.format_lora(l) for l in data]
            folders = sorted(list(set(l['folder'] for l in data)))

            context = {
                "loras": formatted_loras,
                "folders": folders
            }
            
            template = self.template_env.get_template('loras.html')
            rendered = template.render(**context)
            return web.Response(
                text=rendered,
                content_type='text/html'
            )
        except Exception as e:
            print(f"Error handling loras request: {str(e)}")
            import traceback
            print(traceback.format_exc())  # Print full stack trace
            return web.Response(
                text="Error loading loras page",
                content_type='text/html',
                status=500
            )
        
    def filter_civitai_data(self, civitai_data):
        if not civitai_data:
            return {}
            
        required_fields = [
            "id", "modelId", "name", "createdAt", "updatedAt", 
            "publishedAt", "trainedWords", "baseModel", "description",
            "model", "images"
        ]
    
        return {k: civitai_data[k] for k in required_fields if k in civitai_data}
    
    def format_lora(self, lora):
        """格式化前端需要的数据结构"""
        return {
            "model_name": lora["model_name"],
            "file_name": lora["file_name"],   
            "preview_url": self.get_static_url_for_preview(lora["preview_url"]),
            "base_model": lora["base_model"],
            "folder": lora["folder"],
            "sha256": lora["sha256"],
            "file_path": lora["file_path"].replace(os.sep, "/"),
            "modified": lora["modified"],
            "from_civitai": lora.get("from_civitai", True),
            "civitai": self.filter_civitai_data(lora.get("civitai", {}))
        }
    
    def get_static_url_for_preview(self, preview_url):
        """
        Determines which loras_root the preview_url belongs to and
        returns the corresponding static URL.
        """
        for idx, root in enumerate(self.loras_roots, start=1):
            # Check if preview_url belongs to current root
            if preview_url.startswith(root):
                # Get relative path and generate static URL 
                relative_path = os.path.relpath(preview_url, root)
                static_url = f'/loras_static/root{idx}/preview/{relative_path.replace(os.sep, "/")}'
                return static_url
        
        # If no matching root found, return empty string
        return ""


    async def delete_model(self, request):
        try:
            data = await request.json()
            file_path = data.get('file_path')  # 从请求中获取file_path信息
            if not file_path:
                return web.Response(text='Model full path is required', status=400)

            # 构建完整的目录路径
            target_dir = os.path.dirname(file_path)
            file_name = os.path.splitext(os.path.basename(file_path))[0]

            # List of file patterns to delete
            required_file = f"{file_name}.safetensors"  # 主文件必须存在
            optional_files = [  # 这些文件可能不存在
                f"{file_name}.metadata.json",
                f"{file_name}.preview.png",
                f"{file_name}.preview.jpg",
                f"{file_name}.preview.jpeg",
                f"{file_name}.preview.webp",
                f"{file_name}.preview.mp4",
                f"{file_name}.png",
                f"{file_name}.jpg",
                f"{file_name}.jpeg",
                f"{file_name}.webp",
                f"{file_name}.mp4"
            ]
            
            deleted_files = []
            
            # Try to delete the main safetensors file
            main_file_path = os.path.join(target_dir, required_file)
            if os.path.exists(main_file_path):
                try:
                    os.remove(main_file_path)
                    deleted_files.append(required_file)
                except Exception as e:
                    print(f"Error deleting {main_file_path}: {str(e)}")
                    return web.Response(text=f"Failed to delete main model file: {str(e)}", status=500)
                
                # Only try to delete optional files if main file was deleted
                for pattern in optional_files:
                    file_path = os.path.join(target_dir, pattern)
                    if os.path.exists(file_path):
                        try:
                            os.remove(file_path)
                            deleted_files.append(pattern)
                        except Exception as e:
                            print(f"Error deleting optional file {file_path}: {str(e)}")
            else:
                return web.Response(text=f"Model file {required_file} not found in {target_dir}", status=404)
                
            return web.json_response({
                'success': True,
                'deleted_files': deleted_files
            })
        
        except Exception as e:
            return web.Response(text=str(e), status=500)

    async def update_civitai_info(self, file_path: str, civitai_data: Dict, preview_url: Optional[str] = None):
        """Update Civitai metadata and download preview image"""
        # Update metadata file
        await update_civitai_metadata(file_path, civitai_data)
        
        # Download and save preview image if URL is provided
        if preview_url:
            preview_path = f"{os.path.splitext(file_path)[0]}.preview.png"
            try:
                # Add your image download logic here
                # Example:
                # await download_image(preview_url, preview_path)
                pass
            except Exception as e:
                print(f"Error downloading preview image: {str(e)}")

    async def fetch_civitai(self, request):
        try:
            data = await request.json()
            client = CivitaiClient()
            
            try:
                metadata_path = os.path.splitext(data['file_path'])[0] + '.metadata.json'

                local_metadata = {}
                if os.path.exists(metadata_path):
                    with open(metadata_path, 'r', encoding='utf-8') as f:
                        local_metadata = json.load(f)


                if not local_metadata.get('from_civitai', True):
                    return web.json_response(
                        {"success": True, "Notice": "Not from CivitAI"}, 
                        status=200
                    )

                # 1. 获取CivitAI元数据
                civitai_metadata = await client.get_model_by_hash(data["sha256"])
                if not civitai_metadata:
                    local_metadata['from_civitai'] = False
                    with open(metadata_path, 'w', encoding='utf-8') as f:
                        json.dump(local_metadata, f, indent=2, ensure_ascii=False)
                    return web.json_response(
                        {"success": False, "error": "Not found on CivitAI"}, 
                        status=404
                    )

                local_metadata['civitai']=civitai_metadata
                
                # 更新模型名称（优先使用CivitAI名称）
                if 'model' in civitai_metadata:
                    local_metadata['model_name'] = civitai_metadata['model'].get('name', local_metadata.get('model_name'))
                # update base model
                local_metadata['base_model'] = civitai_metadata.get('baseModel')
                
                # 4. 下载预览图
                # Check if existing preview is valid and the file exists
                if not local_metadata.get('preview_url') or not os.path.exists(local_metadata['preview_url']):
                    first_preview = next((img for img in civitai_metadata.get('images', [])), None)
                    if first_preview:
                        
                        preview_extension = '.mp4' if first_preview['type'] == 'video' else os.path.splitext(first_preview['url'])[-1]  # Get the file extension
                        preview_filename = os.path.splitext(os.path.basename(data['file_path']))[0] + '.preview' + preview_extension
                        preview_path = os.path.join(os.path.dirname(data['file_path']), preview_filename)
                        await client.download_preview_image(first_preview['url'], preview_path)
                        # 存储相对路径，使用正斜杠格式
                        local_metadata['preview_url'] = preview_path.replace(os.sep, '/')

                # 5. 保存更新后的元数据
                with open(metadata_path, 'w', encoding='utf-8') as f:
                    json.dump(local_metadata, f, indent=2, ensure_ascii=False)

                return web.json_response({
                    "success": True
                })
                
            except Exception as e:
                print(f"Error in fetch_civitai: {str(e)}")  # Debug log
                return web.json_response({
                    "success": False,
                    "error": str(e)
                }, status=500)
            finally:
                await client.close()
                
        except Exception as e:
            print(f"Error processing request: {str(e)}")  # Debug log
            return web.json_response({
                "success": False,
                "error": f"Request processing error: {str(e)}"
            }, status=400)

    async def replace_preview(self, request):
        try:
            reader = await request.multipart()
            
            # Get the preview_file field first
            file_field = await reader.next()
            if file_field.name != 'preview_file':
                raise ValueError("Expected 'preview_file' field first")
            preview_data = await file_field.read()
            
            # Get the file model_path field
            name_field = await reader.next()
            if name_field.name != 'model_path':
                raise ValueError("Expected 'model_path' field second")
            model_path = (await name_field.read()).decode()
            
            # Get the content type from the file field headers
            content_type = file_field.headers.get('Content-Type', '')

            print(f"Received preview file: {model_path} ({content_type})")  # Debug log
            
            # Determine file extension based on content type
            if content_type.startswith('video/'):
                extension = '.preview.mp4'
            else:
                extension = '.preview.png'
            
            # Construct the preview file path
            base_name = os.path.splitext(os.path.basename(model_path))[0]  # Remove original extension
            preview_name = base_name + extension
            # Get the folder path from the model_path
            folder = os.path.dirname(model_path)
            preview_path = os.path.join(folder, preview_name).replace(os.sep, '/')
            
            # Save the preview file
            with open(preview_path, 'wb') as f:
                f.write(preview_data)
            
            # Update metadata if it exists
            metadata_path = os.path.join(folder, base_name + '.metadata.json')
            if os.path.exists(metadata_path):
                try:
                    with open(metadata_path, 'r', encoding='utf-8') as f:
                        metadata = json.load(f)
                    # Update the preview_url to match the new file name
                    metadata['preview_url'] = preview_path
                    with open(metadata_path, 'w', encoding='utf-8') as f:
                        json.dump(metadata, f, indent=2, ensure_ascii=False)
                except Exception as e:
                    print(f"Error updating metadata: {str(e)}")
                    # Continue even if metadata update fails
            
            return web.json_response({
                "success": True,
                "preview_url": self.get_static_url_for_preview(preview_path)
            })
            
        except Exception as e:
            print(f"Error replacing preview: {str(e)}")
            return web.Response(text=str(e), status=500)

# 注册路由
LorasEndpoint.add_routes()