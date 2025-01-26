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

class LorasEndpoint:
    def __init__(self):
        self.template_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(
                os.path.join(os.path.dirname(__file__), 'templates')
            ),
            autoescape=True
        )
        # 配置Loras根目录（根据实际安装位置调整）
        self.loras_root = os.path.join(Path(__file__).parents[2], "models", "loras")
        # 添加 server 属性
        self.server = PromptServer.instance

    @classmethod
    def add_routes(cls):
        instance = cls()
        app = PromptServer.instance.app
        static_path = os.path.join(os.path.dirname(__file__), 'static')
        app.add_routes([
            web.get('/loras', instance.handle_loras_request),
            web.static('/loras_static/previews', instance.loras_root),
            web.static('/loras_static', static_path),
            web.post('/api/delete_model', instance.delete_model),
            web.post('/api/fetch-civitai', instance.fetch_civitai)
        ])
    
    def send_progress(self, current, total, status="Scanning"):
        """Send progress through websocket"""
        try:
            if hasattr(self.server, 'send_sync'):
                self.server.send_sync("lora-scan-progress", {
                    "value": current,
                    "max": total,
                    "status": status
                })
        except Exception as e:
            print(f"Error sending progress: {str(e)}")

    async def scan_loras(self):
        loras = []
        for root, _, files in os.walk(self.loras_root):
            safetensors_files = [f for f in files if f.endswith('.safetensors')]
            total_files = len(safetensors_files)
            
            for idx, filename in enumerate(safetensors_files, 1):
                self.send_progress(idx, total_files, f"Scanning: {filename}")
                
                file_path = os.path.join(root, filename)
                
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
                rel_path = os.path.relpath(file_path, self.loras_root)
                folder = os.path.dirname(rel_path)
                # Ensure forward slashes for consistency across platforms
                lora_data['folder'] = folder.replace(os.path.sep, '/')
                
                loras.append(lora_data)
            
        self.send_progress(total_files, total_files, "Scan completed")
        return loras


    def clean_description(self, desc):
        """清理HTML格式的描述"""
        return desc.replace("<p>", "").replace("</p>", "\n").strip()

    async def get_preview_url(self, preview_path, root_dir):
        """生成预览图URL"""
        if os.path.exists(preview_path):
            rel_path = os.path.relpath(preview_path, self.loras_root)
            return f"/loras_static/previews/{rel_path.replace(os.sep, '/')}"
        return "/loras_static/images/no-preview.png"

    async def handle_loras_request(self, request):
        """处理Loras请求并渲染模板"""
        try:
            scan_start = time.time()
            data = await self.scan_loras()
            print(f"Scanned {len(data)} loras in {time.time()-scan_start:.2f}s")
            
            # Format the data for the template
            formatted_loras = [self.format_lora(l) for l in data]
            folders = sorted(list(set(l['folder'] for l in data)))

            # Debug logging
            if formatted_loras:
                print(f"Sample lora data: {formatted_loras[0]}")
            else:
                print("Warning: No loras found")
                
            context = {
                "loras": formatted_loras,
                "folders": folders,
                # Only set single lora if we're viewing details
                "lora": formatted_loras[0] if formatted_loras else {
                    "model_name": "",
                    "file_name": "",
                    "preview_url": "",
                    "folder": "",
                    "civitai": {
                        "id": "",
                        "model": "",
                        "base_model": "",
                        "trained_words": [],
                        "creator": "",
                        "downloads": 0,
                        "images": [],
                        "description": ""
                    }
                }
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

    def format_lora(self, lora):
        """格式化前端需要的数据结构"""
        try:
            return {
                "model_name": lora["model_name"],
                "file_name": lora["file_name"],   
                "preview_url": lora["preview_url"],
                "base_model": lora["base_model"],
                "folder": lora["folder"],
                "sha256": lora["sha256"],
                "file_path": lora["file_path"],
                "modified": lora["modified"],
                "civitai": lora.get("civitai", {}) or {}  # 确保当 civitai 为 None 时返回空字典
            }
        except Exception as e:
            print(f"Error formatting lora: {str(e)}")
            print(f"Lora data: {lora}")
            return {
                "model_name": lora.get("model_name", "Unknown"),
                "file_name": lora.get("file_name", ""),   
                "preview_url": lora.get("preview_url", ""), 
                "base_model": lora.get("base_model", ""),
                "folder": lora.get("folder", ""),
                "sha256": lora.get("sha256", ""),
                "file_path": lora.get("file_path", ""),
                "modified": lora.get("modified", ""),
                "civitai": {
                    "id": "",
                    "modelId": "",
                    "model": "",
                    "base_model": "",
                    "trained_words": [],
                    "creator": "",
                    "downloads": 0,
                    "images": [],
                    "description": ""
                }
            }

    async def delete_model(self, request):
        try:
            data = await request.json()
            file_name = data.get('file_name')
            folder = data.get('folder')  # 从请求中获取folder信息
            if not file_name:
                return web.Response(text='Model name is required', status=400)

            # 构建完整的目录路径
            target_dir = self.loras_root
            if folder and folder != "root":
                target_dir = os.path.join(self.loras_root, folder)

            # List of file patterns to delete
            required_file = f"{file_name}.safetensors"  # 主文件必须存在
            optional_files = [  # 这些文件可能不存在
                f"{file_name}.metadata.json",
                f"{file_name}.preview.png",
                f"{file_name}.preview.jpg",
                f"{file_name}.preview.jpeg",
                f"{file_name}.preview.webp"
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
                return web.Response(text=f"Model file {required_file} not found in {folder}", status=404)
                
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
        print("Received fetch-civitai request")  # Debug log
        try:
            data = await request.json()
            print(f"Request data: {data}")  # Debug log
            client = CivitaiClient()
            
            try:
                # 1. 获取CivitAI元数据
                civitai_metadata = await client.get_model_by_hash(data["sha256"])
                if not civitai_metadata:
                    return web.json_response(
                        {"success": False, "error": "Not found on CivitAI"}, 
                        status=404
                    )

                # 2. 读取/创建本地元数据文件
                metadata_path = os.path.splitext(data['file_path'])[0] + '.metadata.json'
                
                # 合并元数据
                local_metadata = {}
                if os.path.exists(metadata_path):
                    with open(metadata_path, 'r', encoding='utf-8') as f:
                        local_metadata = json.load(f)
                        
                # 3. 更新元数据字段
                local_metadata['civitai']=civitai_metadata
                
                # 更新模型名称（优先使用CivitAI名称）
                if 'model' in civitai_metadata:
                    local_metadata['model_name'] = civitai_metadata['model'].get('name', local_metadata.get('model_name'))
                # update base model
                local_metadata['base_model'] = civitai_metadata.get('baseModel')
                
                # 4. 下载预览图
                first_preview = next((img for img in civitai_metadata.get('images', [])), None)
                if first_preview:
                    
                    preview_extension = '.mp4' if first_preview['type'] == 'video' else os.path.splitext(first_preview['url'])[-1]  # Get the file extension
                    preview_filename = os.path.splitext(os.path.basename(data['file_path']))[0] + preview_extension
                    preview_path = os.path.join(os.path.dirname(data['file_path']), preview_filename)
                    await client.download_preview_image(first_preview['url'], preview_path)
                    # 存储相对路径，使用正斜杠格式
                    local_metadata['preview_url'] = os.path.relpath(preview_path, self.loras_root).replace(os.sep, '/')

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

# 注册路由
LorasEndpoint.add_routes()