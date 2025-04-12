import os
import platform
import folder_paths # type: ignore
from typing import List
import logging

logger = logging.getLogger(__name__)

class Config:
    """Global configuration for LoRA Manager"""
    
    def __init__(self):
        self.templates_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'templates')
        self.static_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static')
        # 路径映射字典, target to link mapping
        self._path_mappings = {}
        # 静态路由映射字典, target to route mapping
        self._route_mappings = {}
        self.loras_roots = self._init_lora_paths()
        self.checkpoints_roots = self._init_checkpoint_paths()
        self.temp_directory = folder_paths.get_temp_directory()
        # 在初始化时扫描符号链接
        self._scan_symbolic_links()

    def _is_link(self, path: str) -> bool:
        try:
            if os.path.islink(path):
                return True
            if platform.system() == 'Windows':
                try:
                    import ctypes
                    FILE_ATTRIBUTE_REPARSE_POINT = 0x400
                    attrs = ctypes.windll.kernel32.GetFileAttributesW(str(path))
                    return attrs != -1 and (attrs & FILE_ATTRIBUTE_REPARSE_POINT)
                except Exception as e:
                    logger.error(f"Error checking Windows reparse point: {e}")
            return False
        except Exception as e:
            logger.error(f"Error checking link status for {path}: {e}")
            return False

    def _scan_symbolic_links(self):
        """扫描所有 LoRA 和 Checkpoint 根目录中的符号链接"""
        for root in self.loras_roots:
            self._scan_directory_links(root)
        
        for root in self.checkpoints_roots:
            self._scan_directory_links(root)

    def _scan_directory_links(self, root: str):
        """递归扫描目录中的符号链接"""
        try:
            with os.scandir(root) as it:
                for entry in it:
                    if self._is_link(entry.path):
                        target_path = os.path.realpath(entry.path)
                        if os.path.isdir(target_path):
                            self.add_path_mapping(entry.path, target_path)
                            self._scan_directory_links(target_path)
                    elif entry.is_dir(follow_symlinks=False):
                        self._scan_directory_links(entry.path)
        except Exception as e:
            logger.error(f"Error scanning links in {root}: {e}")

    def add_path_mapping(self, link_path: str, target_path: str):
        """添加符号链接路径映射
        target_path: 实际目标路径
        link_path: 符号链接路径
        """
        normalized_link = os.path.normpath(link_path).replace(os.sep, '/')
        normalized_target = os.path.normpath(target_path).replace(os.sep, '/')
        # 保持原有的映射关系：目标路径 -> 链接路径
        self._path_mappings[normalized_target] = normalized_link
        logger.info(f"Added path mapping: {normalized_target} -> {normalized_link}")

    def add_route_mapping(self, path: str, route: str):
        """添加静态路由映射"""
        normalized_path = os.path.normpath(path).replace(os.sep, '/')
        self._route_mappings[normalized_path] = route
        # logger.info(f"Added route mapping: {normalized_path} -> {route}")

    def map_path_to_link(self, path: str) -> str:
        """将目标路径映射回符号链接路径"""
        normalized_path = os.path.normpath(path).replace(os.sep, '/')
        # 检查路径是否包含在任何映射的目标路径中
        for target_path, link_path in self._path_mappings.items():
            if normalized_path.startswith(target_path):
                # 如果路径以目标路径开头，则替换为链接路径
                mapped_path = normalized_path.replace(target_path, link_path, 1)
                return mapped_path
        return path
    
    def map_link_to_path(self, link_path: str) -> str:
        """将符号链接路径映射回实际路径"""
        normalized_link = os.path.normpath(link_path).replace(os.sep, '/')
        # 检查路径是否包含在任何映射的目标路径中
        for target_path, link_path in self._path_mappings.items():
            if normalized_link.startswith(target_path):
                # 如果路径以目标路径开头，则替换为实际路径
                mapped_path = normalized_link.replace(target_path, link_path, 1)
                return mapped_path
        return link_path

    def _init_lora_paths(self) -> List[str]:
        """Initialize and validate LoRA paths from ComfyUI settings"""
        paths = sorted(set(path.replace(os.sep, "/") 
                for path in folder_paths.get_folder_paths("loras") 
                if os.path.exists(path)), key=lambda p: p.lower())
        print("Found LoRA roots:", "\n - " + "\n - ".join(paths))
        
        if not paths:
            raise ValueError("No valid loras folders found in ComfyUI configuration")
        
        # 初始化路径映射
        for path in paths:
            real_path = os.path.normpath(os.path.realpath(path)).replace(os.sep, '/')
            if real_path != path:
                self.add_path_mapping(path, real_path)
        
        return paths

    def _init_checkpoint_paths(self) -> List[str]:
        """Initialize and validate checkpoint paths from ComfyUI settings"""
        # Get checkpoint paths from folder_paths
        checkpoint_paths = folder_paths.get_folder_paths("checkpoints")
        diffusion_paths = folder_paths.get_folder_paths("diffusers")
        unet_paths = folder_paths.get_folder_paths("unet")
        
        # Combine all checkpoint-related paths
        all_paths = checkpoint_paths + diffusion_paths + unet_paths
        
        # Filter and normalize paths
        paths = sorted(set(path.replace(os.sep, "/") 
                for path in all_paths 
                if os.path.exists(path)), key=lambda p: p.lower())
        
        print("Found checkpoint roots:", paths)
        
        if not paths:
            logger.warning("No valid checkpoint folders found in ComfyUI configuration")
            return []
        
        # 初始化路径映射，与 LoRA 路径处理方式相同
        for path in paths:
            real_path = os.path.normpath(os.path.realpath(path)).replace(os.sep, '/')
            if real_path != path:
                self.add_path_mapping(path, real_path)
        
        return paths

    def get_preview_static_url(self, preview_path: str) -> str:
        """Convert local preview path to static URL"""
        if not preview_path:
            return ""
        
        real_path = os.path.realpath(preview_path).replace(os.sep, '/')

        for path, route in self._route_mappings.items():
            if real_path.startswith(path):
                relative_path = os.path.relpath(real_path, path)
                return f'{route}/{relative_path.replace(os.sep, "/")}'

        return ""

# Global config instance
config = Config()
