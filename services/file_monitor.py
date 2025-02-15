from operator import itemgetter
import os
import logging
import asyncio
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileCreatedEvent, FileDeletedEvent
from typing import List
from threading import Lock
from .lora_scanner import LoraScanner

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

    def _should_ignore(self, path: str) -> bool:
        """Check if path should be ignored"""
        return path.replace(os.sep, '/') in self._ignore_paths

    def add_ignore_path(self, path: str, file_size: int = 0):
        """Add path to ignore list with dynamic timeout based on file size"""
        self._ignore_paths.add(path.replace(os.sep, '/'))
        
        # Calculate timeout based on file size, with a minimum value
        # Assuming average download speed of 1MB/s
        timeout = max(
            self._min_ignore_timeout,
            (file_size / self._download_speed) * 1.5  # Add 50% buffer
        )
        
        logger.debug(f"Adding {path} to ignore list for {timeout:.1f} seconds")
        
        asyncio.get_event_loop().call_later(
            timeout,
            self._ignore_paths.discard,
            path
        )
        
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
        logger.info(f"LoRA file deleted: {event.src_path}")
        self._schedule_update('remove', event.src_path)
        
    def _schedule_update(self, action: str, file_path: str):
        """Schedule a cache update"""
        with self.lock:
            # 标准化路径
            normalized_path = file_path.replace(os.sep, '/')
            self.pending_changes.add((action, normalized_path))
            
            # 使用 call_soon_threadsafe 在事件循环中安排任务
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
        self.roots = roots
        self.observer = Observer()
        # 获取当前运行的事件循环
        self.loop = asyncio.get_event_loop()
        self.handler = LoraFileHandler(scanner, self.loop)
        
    def start(self):
        """Start monitoring"""
        for root in self.roots:
            try:
                self.observer.schedule(self.handler, root, recursive=True)
                logger.info(f"Started monitoring: {root}")
            except Exception as e:
                logger.error(f"Error monitoring {root}: {e}")
                
        self.observer.start()
        
    def stop(self):
        """Stop monitoring"""
        self.observer.stop()
        self.observer.join()