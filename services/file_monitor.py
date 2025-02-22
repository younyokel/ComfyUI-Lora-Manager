from operator import itemgetter
import os
import logging
import asyncio
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileCreatedEvent, FileDeletedEvent
from typing import List
from threading import Lock
from .lora_scanner import LoraScanner
import platform

logger = logging.getLogger(__name__)

class LoraFileHandler(FileSystemEventHandler):
    """Handler for LoRA file system events"""
    
    def __init__(self, scanner: LoraScanner, loop: asyncio.AbstractEventLoop):
        self.scanner = scanner
        self.loop = loop  # 存储事件循环引用
        self.pending_changes = set()  # 待处理的变更
        self.lock = Lock()  # 线程安全锁
        self.update_task = None  # 异步更新任务
        self._ignore_paths = set()  # Add ignore paths set
        self._min_ignore_timeout = 5  # minimum timeout in seconds
        self._download_speed = 1024 * 1024  # assume 1MB/s as base speed
        self._path_mappings = {}  # 添加路径映射字典

    def _should_ignore(self, path: str) -> bool:
        """Check if path should be ignored"""
        real_path = os.path.realpath(path)  # Resolve any symbolic links
        return real_path.replace(os.sep, '/') in self._ignore_paths

    def add_ignore_path(self, path: str, file_size: int = 0):
        """Add path to ignore list with dynamic timeout based on file size"""
        real_path = os.path.realpath(path)  # Resolve any symbolic links
        self._ignore_paths.add(real_path.replace(os.sep, '/'))
        
        # Calculate timeout based on file size, with a minimum value
        # Assuming average download speed of 1MB/s
        timeout = max(
            self._min_ignore_timeout,
            (file_size / self._download_speed) * 1.5  # Add 50% buffer
        )
        
        logger.debug(f"Adding {real_path} to ignore list for {timeout:.1f} seconds")
        
        asyncio.get_event_loop().call_later(
            timeout,
            self._ignore_paths.discard,
            real_path.replace(os.sep, '/')
        )
        
    def add_path_mapping(self, link_path: str, target_path: str):
        """添加符号链接路径映射"""
        normalized_link = os.path.normpath(link_path).replace(os.sep, '/')
        normalized_target = os.path.normpath(target_path).replace(os.sep, '/')
        self._path_mappings[normalized_target] = normalized_link
        logger.debug(f"Added path mapping: {normalized_target} -> {normalized_link}")

    def _map_path_to_link(self, path: str) -> str:
        """将目标路径映射回符号链接路径"""
        normalized_path = os.path.normpath(path).replace(os.sep, '/')
        for target_prefix, link_prefix in self._path_mappings.items():
            if normalized_path.startswith(target_prefix):
                mapped_path = normalized_path.replace(target_prefix, link_prefix, 1)
                logger.debug(f"Mapped path {normalized_path} to {mapped_path}")
                return mapped_path
        return path

    def on_created(self, event):
        if event.is_directory or not event.src_path.endswith('.safetensors'):
            return
        if self._should_ignore(event.src_path):
            return
        logger.info(f"LoRA file created: {event.src_path}")
        self._schedule_update('add', event.src_path)

    def on_deleted(self, event):
        if event.is_directory or not event.src_path.endswith('.safetensors'):
            return
        if self._should_ignore(event.src_path):
            return
        logger.info(f"LoRA file deleted: {event.src_path}")
        self._schedule_update('remove', event.src_path)
        
    def _schedule_update(self, action: str, file_path: str):
        """Schedule a cache update"""
        with self.lock:
            # 将目标路径映射回符号链接路径
            mapped_path = self._map_path_to_link(file_path)
            normalized_path = mapped_path.replace(os.sep, '/')
            self.pending_changes.add((action, normalized_path))
            
            self.loop.call_soon_threadsafe(self._create_update_task)

    def _create_update_task(self):
        """Create update task in the event loop"""
        if self.update_task is None or self.update_task.done():
            self.update_task = asyncio.create_task(self._process_changes())

    async def _process_changes(self, delay: float = 2.0):
        """Process pending changes with debouncing"""
        await asyncio.sleep(delay)
        
        try:
            with self.lock:
                changes = self.pending_changes.copy()
                self.pending_changes.clear()
            
            if not changes:
                return
            
            
            logger.info(f"Processing {len(changes)} file changes")

            cache = await self.scanner.get_cached_data()  # 先完成可能的初始化
            needs_resort = False
            new_folders = set()  # 用于收集新的文件夹
            
            for action, file_path in changes:
                try:
                    if action == 'add':
                        # 扫描新文件
                        lora_data = await self.scanner.scan_single_lora(file_path)
                        if lora_data:
                            cache.raw_data.append(lora_data)
                            new_folders.add(lora_data['folder'])  # 收集新文件夹
                            needs_resort = True
                            
                    elif action == 'remove':
                        # 从缓存中移除
                        cache.raw_data = [
                            item for item in cache.raw_data 
                            if item['file_path'] != file_path
                        ]
                        needs_resort = True
                        
                except Exception as e:
                    logger.error(f"Error processing {action} for {file_path}: {e}")
            
            if needs_resort:
                await cache.resort()
                
                # 更新文件夹列表，包括新添加的文件夹
                all_folders = set(cache.folders) | new_folders
                cache.folders = sorted(list(all_folders), key=lambda x: x.lower())
                
        except Exception as e:
            logger.error(f"Error in process_changes: {e}")


class LoraFileMonitor:
    """Monitor for LoRA file changes"""
    
    def __init__(self, scanner: LoraScanner, roots: List[str]):
        self.scanner = scanner
        scanner.set_file_monitor(self)
        self.observer = Observer()
        self.loop = asyncio.get_event_loop()
        self.handler = LoraFileHandler(scanner, self.loop)
        
        # 存储所有需要监控的路径（包括链接的目标路径）
        self.monitor_paths = set()
        for root in roots:
            real_root = os.path.realpath(root)
            self.monitor_paths.add(real_root)
            # 扫描根目录下的链接
            self._add_link_targets(root)

    def _is_link(self, path: str) -> bool:
        """
        检查路径是否为链接
        支持:
        - Windows: Symbolic Links, Junction Points
        - Linux: Symbolic Links
        """
        try:
            # 首先检查通用的符号链接
            if os.path.islink(path):
                return True

            # Windows 特定的 Junction Points 检测
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

    def _get_link_target(self, path: str) -> str:
        """获取链接目标路径"""
        try:
            return os.path.realpath(path)
        except Exception as e:
            logger.error(f"Error resolving link target for {path}: {e}")
            return path

    def _add_link_targets(self, root: str):
        """递归扫描目录，添加链接指向的目标路径"""
        try:
            with os.scandir(root) as it:
                for entry in it:
                    logger.debug(f"Checking path: {entry.path}")
                    if self._is_link(entry.path):
                        # 获取链接的目标路径
                        target_path = self._get_link_target(entry.path)
                        if os.path.isdir(target_path):
                            normalized_target = os.path.normpath(target_path)
                            self.monitor_paths.add(normalized_target)
                            # 添加路径映射到处理器
                            self.handler.add_path_mapping(entry.path, target_path)
                            logger.info(f"Found link: {entry.path} -> {normalized_target}")
                            # 递归扫描目标目录中的链接
                            self._add_link_targets(target_path)
                    elif entry.is_dir(follow_symlinks=False):
                        # 递归扫描子目录
                        self._add_link_targets(entry.path)
        except Exception as e:
            logger.error(f"Error scanning links in {root}: {e}")

    def start(self):
        """Start monitoring"""
        for path_info in self.monitor_paths:
            try:
                if isinstance(path_info, tuple):
                    # 对于链接，监控目标路径
                    _, target_path = path_info
                    self.observer.schedule(self.handler, target_path, recursive=True)
                    logger.info(f"Started monitoring target path: {target_path}")
                else:
                    # 对于普通路径，直接监控
                    self.observer.schedule(self.handler, path_info, recursive=True)
                    logger.info(f"Started monitoring: {path_info}")
            except Exception as e:
                logger.error(f"Error monitoring {path_info}: {e}")
                
        self.observer.start()
        
    def stop(self):
        """Stop monitoring"""
        self.observer.stop()
        self.observer.join()

    def rescan_links(self):
        """重新扫描链接（当添加新的链接时调用）"""
        new_paths = set()
        for path in self.monitor_paths.copy():
            self._add_link_targets(path)
        
        # 添加新发现的路径到监控
        new_paths = self.monitor_paths - set(self.observer.watches.keys())
        for path in new_paths:
            try:
                self.observer.schedule(self.handler, path, recursive=True)
                logger.info(f"Added new monitoring path: {path}")
            except Exception as e:
                logger.error(f"Error adding new monitor for {path}: {e}")