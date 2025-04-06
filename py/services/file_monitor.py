from operator import itemgetter
import os
import logging
import asyncio
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from typing import List, Dict, Set
from threading import Lock
from .lora_scanner import LoraScanner
from ..config import config

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
        
        # Track modified files with timestamps for debouncing
        self.modified_files: Dict[str, float] = {}
        self.debounce_timer = None
        self.debounce_delay = 3.0  # seconds to wait after last modification
        
        # Track files that are already scheduled for processing
        self.scheduled_files: Set[str] = set()

    def _should_ignore(self, path: str) -> bool:
        """Check if path should be ignored"""
        real_path = os.path.realpath(path)  # Resolve any symbolic links
        return real_path.replace(os.sep, '/') in self._ignore_paths

    def add_ignore_path(self, path: str, file_size: int = 0):
        """Add path to ignore list with dynamic timeout based on file size"""
        real_path = os.path.realpath(path)  # Resolve any symbolic links
        self._ignore_paths.add(real_path.replace(os.sep, '/'))
        
        # Short timeout (e.g. 5 seconds) is sufficient to ignore the CREATE event
        timeout = 5
        
        self.loop.call_later(
            timeout,
            self._ignore_paths.discard,
            real_path.replace(os.sep, '/')
        )
        
    def on_created(self, event):
        if event.is_directory:
            return
            
        # Handle safetensors files directly
        if event.src_path.endswith('.safetensors'):
            if self._should_ignore(event.src_path):
                return
            
            # We'll process this file directly and ignore subsequent modifications
            # to prevent duplicate processing
            normalized_path = os.path.realpath(event.src_path).replace(os.sep, '/')
            if normalized_path not in self.scheduled_files:
                logger.info(f"LoRA file created: {event.src_path}")
                self.scheduled_files.add(normalized_path)
                self._schedule_update('add', event.src_path)
                
                # Ignore modifications for a short period after creation
                # This helps avoid duplicate processing
                self.loop.call_later(
                    self.debounce_delay * 2,
                    self.scheduled_files.discard,
                    normalized_path
                )
            
        # For browser downloads, we'll catch them when they're renamed to .safetensors
        
    def on_modified(self, event):
        if event.is_directory:
            return
            
        # Only process safetensors files
        if event.src_path.endswith('.safetensors'):
            if self._should_ignore(event.src_path):
                return
                
            normalized_path = os.path.realpath(event.src_path).replace(os.sep, '/')
            
            # Skip if this file is already scheduled for processing
            if normalized_path in self.scheduled_files:
                return
                
            # Update the timestamp for this file
            self.modified_files[normalized_path] = time.time()
            
            # Cancel any existing timer
            if self.debounce_timer:
                self.debounce_timer.cancel()
                
            # Set a new timer to process modified files after debounce period
            self.debounce_timer = self.loop.call_later(
                self.debounce_delay, 
                self.loop.call_soon_threadsafe,
                self._process_modified_files
            )

    def _process_modified_files(self):
        """Process files that have been modified after debounce period"""
        current_time = time.time()
        files_to_process = []
        
        # Find files that haven't been modified for debounce_delay seconds
        for file_path, last_modified in list(self.modified_files.items()):
            if current_time - last_modified >= self.debounce_delay:
                # Only process if not already scheduled
                if file_path not in self.scheduled_files:
                    files_to_process.append(file_path)
                    self.scheduled_files.add(file_path)
                    
                    # Auto-remove from scheduled list after reasonable time
                    self.loop.call_later(
                        self.debounce_delay * 2,
                        self.scheduled_files.discard,
                        file_path
                    )
                
                del self.modified_files[file_path]
        
        # Process stable files
        for file_path in files_to_process:
            logger.info(f"Processing modified LoRA file: {file_path}")
            self._schedule_update('add', file_path)

    def on_deleted(self, event):
        if event.is_directory or not event.src_path.endswith('.safetensors'):
            return
        if self._should_ignore(event.src_path):
            return
        
        # Remove from scheduled files if present
        normalized_path = os.path.realpath(event.src_path).replace(os.sep, '/')
        self.scheduled_files.discard(normalized_path)
        
        logger.info(f"LoRA file deleted: {event.src_path}")
        self._schedule_update('remove', event.src_path)
        
    def on_moved(self, event):
        """Handle file move/rename events"""
        
        # If destination is a safetensors file, treat it as a new file
        if event.dest_path.endswith('.safetensors'):
            if self._should_ignore(event.dest_path):
                return
                
            normalized_path = os.path.realpath(event.dest_path).replace(os.sep, '/')
            
            # Only process if not already scheduled
            if normalized_path not in self.scheduled_files:
                logger.info(f"LoRA file renamed/moved to: {event.dest_path}")
                self.scheduled_files.add(normalized_path)
                self._schedule_update('add', event.dest_path)
                
                # Auto-remove from scheduled list after reasonable time
                self.loop.call_later(
                    self.debounce_delay * 2, 
                    self.scheduled_files.discard,
                    normalized_path
                )
            
        # If source was a safetensors file, treat it as deleted
        if event.src_path.endswith('.safetensors'):
            if self._should_ignore(event.src_path):
                return
                
            normalized_path = os.path.realpath(event.src_path).replace(os.sep, '/')
            self.scheduled_files.discard(normalized_path)
            
            logger.info(f"LoRA file moved/renamed from: {event.src_path}")
            self._schedule_update('remove', event.src_path)

    def _schedule_update(self, action: str, file_path: str): #file_path is a real path
        """Schedule a cache update"""
        with self.lock:
            # 使用 config 中的方法映射路径
            mapped_path = config.map_path_to_link(file_path)
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

            cache = await self.scanner.get_cached_data()
            needs_resort = False
            new_folders = set()
            
            for action, file_path in changes:
                try:
                    if action == 'add':
                        # Check if file already exists in cache
                        existing = next((item for item in cache.raw_data if item['file_path'] == file_path), None)
                        if existing:
                            logger.info(f"File {file_path} already in cache, skipping")
                            continue
                            
                        # Scan new file
                        lora_data = await self.scanner.scan_single_lora(file_path)
                        if lora_data:
                            # Update tags count
                            for tag in lora_data.get('tags', []):
                                self.scanner._tags_count[tag] = self.scanner._tags_count.get(tag, 0) + 1
                            
                            cache.raw_data.append(lora_data)
                            new_folders.add(lora_data['folder'])
                            # Update hash index
                            if 'sha256' in lora_data:
                                self.scanner._hash_index.add_entry(
                                    lora_data['sha256'], 
                                    lora_data['file_path']
                                )
                            needs_resort = True
                            
                    elif action == 'remove':
                        # Find the lora to remove so we can update tags count
                        lora_to_remove = next((item for item in cache.raw_data if item['file_path'] == file_path), None)
                        if lora_to_remove:
                            # Update tags count by reducing counts
                            for tag in lora_to_remove.get('tags', []):
                                if tag in self.scanner._tags_count:
                                    self.scanner._tags_count[tag] = max(0, self.scanner._tags_count[tag] - 1)
                                    if self.scanner._tags_count[tag] == 0:
                                        del self.scanner._tags_count[tag]
                        
                        # Remove from cache and hash index
                        logger.info(f"Removing {file_path} from cache")
                        self.scanner._hash_index.remove_by_path(file_path)
                        cache.raw_data = [
                            item for item in cache.raw_data 
                            if item['file_path'] != file_path
                        ]
                        needs_resort = True
                        
                except Exception as e:
                    logger.error(f"Error processing {action} for {file_path}: {e}")
            
            if needs_resort:
                await cache.resort()
                
                # Update folder list
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
        
        # 使用已存在的路径映射
        self.monitor_paths = set()
        for root in roots:
            self.monitor_paths.add(os.path.realpath(root).replace(os.sep, '/'))

        # 添加所有已映射的目标路径
        for target_path in config._path_mappings.keys():
            self.monitor_paths.add(target_path)

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