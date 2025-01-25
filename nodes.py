# nodes.py 更新后的核心代码
import os
import json
import time
from pathlib import Path
from aiohttp import web
from server import PromptServer
import jinja2
from flask import jsonify, request
from safetensors import safe_open
from .utils.file_utils import get_file_info, save_metadata, load_metadata, update_civitai_metadata
from .utils.lora_metadata import extract_lora_metadata
from typing import Dict, Optional

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

    @classmethod
    def add_routes(cls):
        instance = cls()
        app = PromptServer.instance.app
        static_path = os.path.join(os.path.dirname(__file__), 'static')
        app.add_routes([
            web.get('/loras', instance.handle_loras_request),
            web.static('/loras_static/previews', instance.loras_root),
            web.static('/loras_static', static_path),
            web.post('/api/delete_model', instance.delete_model)
        ])
    
    def send_progress(self, current, total, status="Scanning"):
        """Send progress through websocket"""
        if self.server and hasattr(self.server, 'send_sync'):
            self.server.send_sync("lora-scan-progress", {
                "value": current,
                "max": total,
                "status": status
            })

    async def scan_loras(self):
        """扫描Loras目录并返回结构化数据"""
        loras = []
        folders = set()

        # 遍历Loras目录（包含子目录）
        for root, _, files in os.walk(self.loras_root):
            rel_path = os.path.relpath(root, self.loras_root)
            if rel_path == ".":
                current_folder = "root"
            else:
                current_folder = rel_path.replace(os.sep, "/")
                folders.add(current_folder)

            for file in files:
                safetensors_files = [f for f in files if f.endswith('.safetensors')]
                total_files = len(safetensors_files)
                
                # 识别模型文件
                if file.endswith('.safetensors'):
                    base_name = os.path.splitext(file)[0]
                    model_path = os.path.join(root, file)
                    
                    # Get basic file info and metadata
                    file_info = await get_file_info(model_path)
                    base_model_info = await extract_lora_metadata(model_path)
                    file_info.update(base_model_info)
                    
                    # Load existing metadata or create new one
                    metadata = await load_metadata(model_path)
                    if not metadata:
                        # First time scanning this file
                        await save_metadata(model_path, file_info)
                        metadata = file_info
                    else:
                        # Update basic file info in existing metadata
                        metadata.update(file_info)
                        await save_metadata(model_path, metadata)
                    
                    # Add civitai data to return value if exists
                    if 'civitai' in metadata:
                        metadata.update(metadata['civitai'])
                    
                    # 查找预览图
                    preview_path = os.path.join(root, f"{base_name}.preview.png")
                    preview_url = await self.get_preview_url(preview_path, root) if os.path.exists(preview_path) else None

                    loras.append({
                        "name": base_name,
                        "folder": current_folder,
                        "path": model_path,
                        "preview_url": preview_url,
                        "metadata": metadata,
                        "size": os.path.getsize(model_path),
                        "modified": os.path.getmtime(model_path)
                    })

        self.send_progress(total_files, total_files, "Scan completed")
        return {
            "loras": sorted(loras, key=lambda x: x["name"].lower()),
            "folders": sorted(folders)
        }

    async def parse_model_metadata(self, file_path):
        """从safetensors文件中提取元数据"""
        try:
            with safe_open(file_path, framework="pt", device="cpu") as f:
                metadata = f.metadata()
                if metadata:
                    return metadata
        except Exception as e:
            print(f"Error reading metadata from {file_path}: {str(e)}")
        return {}

    async def parse_metadata(self, meta_file):
        """解析元数据文件"""
        try:
            if os.path.exists(meta_file):
                with open(meta_file, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
                    return {
                        "id": meta.get("id"),
                        "modelId": meta.get("modelId"),
                        "model": meta.get("model", {}).get("name"),
                        "base_model": meta.get("baseModel"),
                        "trained_words": meta.get("trainedWords", []),
                        "creator": meta.get("creator", {}).get("username"),
                        "downloads": meta.get("stats", {}).get("downloadCount", 0),
                        "images": [img["url"] for img in meta.get("images", [])[:3]],
                        "description": self.clean_description(
                            meta.get("model", {}).get("description", "")
                        )
                    }
        except Exception as e:
            print(f"Error parsing metadata {meta_file}: {str(e)}")
            return {}

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
            print(f"Scanned {len(data['loras'])} loras in {time.time()-scan_start:.2f}s")
            
            # Format the data for the template
            formatted_loras = [self.format_lora(l) for l in data["loras"]]
            
            # Debug logging
            if formatted_loras:
                print(f"Sample lora data: {formatted_loras[0]}")
            else:
                print("Warning: No loras found")
                
            context = {
                "folders": data.get("folders", []),
                "loras": formatted_loras,
                # Only set single lora if we're viewing details
                "lora": formatted_loras[0] if formatted_loras else {
                    "name": "",
                    "folder": "",
                    "file_name": "",
                    "preview_url": "",
                    "modified": "",
                    "size": "0MB",
                    "meta": {
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
            metadata = lora.get("metadata", {})
            
            return {
                "name": lora["name"],
                "folder": lora["folder"],   
                "preview_url": lora["preview_url"],
                "modified": time.strftime("%Y-%m-%d %H:%M", 
                        time.localtime(lora["modified"])),
                "size": f"{lora['size']/1024/1024:.1f}MB",
                "meta": {
                    "id": metadata.get("id", ""),
                    "modelId": metadata.get("modelId", ""),
                    "model": metadata.get("model", ""),
                    "base_model": metadata.get("base_model", ""),
                    "trained_words": metadata.get("trained_words", []),
                    "creator": metadata.get("creator", ""),
                    "downloads": metadata.get("downloads", 0),
                    "images": metadata.get("images", []),
                    "description": metadata.get("description", "")
                }
            }
        except Exception as e:
            print(f"Error formatting lora: {str(e)}")
            print(f"Lora data: {lora}")
            return {
                "name": lora.get("name", "Unknown"),
                "folder": lora.get("folder", ""),   
                "preview_url": lora.get("preview_url", ""),
                "modified": "",
                "size": "0MB",
                "meta": {
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
            model_name = data.get('model_name')
            folder = data.get('folder')  # 从请求中获取folder信息
            if not model_name:
                return web.Response(text='Model name is required', status=400)

            # 构建完整的目录路径
            target_dir = self.loras_root
            if folder and folder != "root":
                target_dir = os.path.join(self.loras_root, folder)

            # List of file patterns to delete
            required_file = f"{model_name}.safetensors"  # 主文件必须存在
            optional_files = [  # 这些文件可能不存在
                f"{model_name}.civitai.info",
                f"{model_name}.preview.png"
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

# 注册路由
LorasEndpoint.add_routes()