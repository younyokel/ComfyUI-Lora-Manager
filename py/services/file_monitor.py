from operator import itemgetter
import os
import logging
import asyncio
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileCreatedEvent, FileDeletedEvent
from typing import List
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
        self._ignore_paths = {}  # Change to dictionary to store expiration times
        self._min_ignore_timeout = 5  # minimum timeout in seconds
        self._download_speed = 1024 * 1024  # assume 1MB/s as base speed

    def _should_ignore(self, path: str) -> bool:
        """Check if path should be ignored"""
        real_path = os.path.realpath(path)  # Resolve any symbolic links
        normalized_path = real_path.replace(os.sep, '/')
        
        # Also check with backslashes for Windows compatibility
        alt_path = real_path.replace('/', '\\')
        
        # 使用传入的事件循环而不是尝试获取当前线程的事件循环
        current_time = self.loop.time()
        
        # Check if path is in ignore list and not expired
        if normalized_path in self._ignore_paths and self._ignore_paths[normalized_path] > current_time:
            return True
        
        # Also check alternative path format
        if alt_path in self._ignore_paths and self._ignore_paths[alt_path] > current_time:
            return True
            
        return False

    def add_ignore_path(self, path: str, file_size: int = 0):
        """Add path to ignore list with dynamic timeout based on file size"""
        real_path = os.path.realpath(path)  # Resolve any symbolic links
        normalized_path = real_path.replace(os.sep, '/')
        
        # Calculate timeout based on file size
        # For small files, use minimum timeout
        # For larger files, estimate download time + buffer
        if file_size > 0:
            # Estimate download time in seconds (size / speed) + buffer
            estimated_time = (file_size / self._download_speed) + 10
            timeout = max(self._min_ignore_timeout, estimated_time)
        else:
            timeout = self._min_ignore_timeout
        
        current_time = self.loop.time()
        expiration_time = current_time + timeout
        
        # Store both normalized and alternative path formats
        self._ignore_paths[normalized_path] = expiration_time
        
        # Also store with backslashes for Windows compatibility
        alt_path = real_path.replace('/', '\\')
        self._ignore_paths[alt_path] = expiration_time
        
        logger.debug(f"Added ignore path: {normalized_path} (expires in {timeout:.1f}s)")
        
        self.loop.call_later(
            timeout,
            self._remove_ignore_path,
            normalized_path
        )
    
    def _remove_ignore_path(self, path: str):
        """Remove path from ignore list after timeout"""
        if path in self._ignore_paths:
            del self._ignore_paths[path]
            logger.debug(f"Removed ignore path: {path}")
        
        # Also remove alternative path format
        alt_path = path.replace('/', '\\')
        if alt_path in self._ignore_paths:
            del self._ignore_paths[alt_path]

    def on_created(self, event):
        if event.is_directory or not event.src_path.endswith('.safetensors'):
            return
        if self._should_ignore(event.src_path):
            return
        
        # Check if file is still being downloaded
        try:
            file_size = os.path.getsize(event.src_path)
            # Record the file path and size to handle potential deletion during download
            self.add_ignore_path(event.src_path, file_size)
            
            # Only process file if it exists and has non-zero size
            if os.path.exists(event.src_path) and file_size > 0:
                logger.info(f"LoRA file created: {event.src_path} (size: {file_size} bytes)")
                self._schedule_update('add', event.src_path)
            else:
                logger.debug(f"Ignoring empty or non-existent file: {event.src_path}")
        except FileNotFoundError:
            # File disappeared between event and our check - likely a temporary download file
            logger.debug(f"File disappeared before processing: {event.src_path}")
        except Exception as e:
            logger.error(f"Error processing create event for {event.src_path}: {str(e)}")

    def on_deleted(self, event):
        if event.is_directory or not event.src_path.endswith('.safetensors'):
            return
        
        # If this path is in our ignore list, it might be part of a download process
        # Don't remove it from the cache yet
        if self._should_ignore(event.src_path):
            logger.debug(f"Ignoring delete event for in-progress download: {event.src_path}")
            return
            
        logger.info(f"LoRA file deleted: {event.src_path}")
        self._schedule_update('remove', event.src_path)
        
    def on_modified(self, event):
        if event.is_directory or not event.src_path.endswith('.safetensors'):
            return
        if self._should_ignore(event.src_path):
            return
        
        try:
            # File modification could indicate download completion
            file_size = os.path.getsize(event.src_path)
            if file_size > 0:
                logger.debug(f"LoRA file modified: {event.src_path} (size: {file_size} bytes)")
                # Update the ignore timeout based on the new size
                self.add_ignore_path(event.src_path, file_size)
                # Schedule an update to add the file once the ignore period expires
                self._schedule_update('add', event.src_path)
        except FileNotFoundError:
            # File disappeared - ignore
            pass
        except Exception as e:
            logger.error(f"Error processing modify event for {event.src_path}: {str(e)}")

    def _schedule_update(self, action: str, file_path: str): #file_path is a real path
        """Schedule a cache update"""
        with self.lock:
            # Store the real path rather than trying to map it here
            # This ensures we have the actual file system path when checking existence later
            self.pending_changes.add((action, file_path))
            
            self.loop.call_soon_threadsafe(self._create_update_task)

    def _create_update_task(self):
        """Create update task in the event loop"""
        if self.update_task is None or self.update_task.done():
            self.update_task = asyncio.create_task(self._process_changes())

    async def _process_changes(self, delay: float = 5.0):
        """Process pending changes with debouncing - increased delay to allow downloads to complete"""
        await asyncio.sleep(delay)
        
        try:
            with self.lock:
                changes = self.pending_changes.copy()
                self.pending_changes.clear()
            
            if not changes:
                return
            
            logger.info(f"Processing {len(changes)} file changes")

            # First collect all actions by file path to handle contradicting events
            actions_by_path = {}
            for action, file_path in changes:
                # For the same file path, 'add' takes precedence over 'remove'
                if file_path not in actions_by_path or action == 'add':
                    actions_by_path[file_path] = action
            
            # Process the final actions
            cache = await self.scanner.get_cached_data()
            needs_resort = False
            new_folders = set()
            
            for file_path, action in actions_by_path.items():
                try:
                    # For 'add' actions, verify the file still exists and is complete
                    if action == 'add':
                        # Use the original real path from the event for file system checks
                        real_path = file_path
                        
                        if not os.path.exists(real_path):
                            logger.warning(f"Skipping add for non-existent file: {real_path}")
                            continue
                            
                        file_size = os.path.getsize(real_path)
                        if file_size == 0:
                            logger.warning(f"Skipping add for empty file: {real_path}")
                            continue
                        
                        # Map the real path to link path for the cache after confirming file exists
                        mapped_path = config.map_path_to_link(real_path)
                        normalized_path = mapped_path.replace(os.sep, '/')
                        
                        # Scan new file with the mapped path
                        lora_data = await self.scanner.scan_single_lora(normalized_path)
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
                            logger.info(f"Added LoRA to cache: {normalized_path}")
                            
                            # Remove from ignore list now that it's been successfully processed
                            # This allows delete events to be processed immediately
                            real_path_normalized = os.path.realpath(real_path).replace(os.sep, '/')
                            alt_path = real_path_normalized.replace('/', '\\')
                            
                            if real_path_normalized in self._ignore_paths:
                                logger.debug(f"Removing successfully processed file from ignore list: {real_path_normalized}")
                                del self._ignore_paths[real_path_normalized]
                            
                            if alt_path in self._ignore_paths:
                                del self._ignore_paths[alt_path]
                            
                    elif action == 'remove':
                        # Map the path for removal operations
                        mapped_path = config.map_path_to_link(file_path)
                        normalized_path = mapped_path.replace(os.sep, '/')
                        
                        # Find the lora to remove so we can update tags count
                        lora_to_remove = next((item for item in cache.raw_data if item['file_path'] == normalized_path), None)
                        if lora_to_remove:
                            # Update tags count by reducing counts
                            for tag in lora_to_remove.get('tags', []):
                                if tag in self.scanner._tags_count:
                                    self.scanner._tags_count[tag] = max(0, self.scanner._tags_count[tag] - 1)
                                    if self.scanner._tags_count[tag] == 0:
                                        del self.scanner._tags_count[tag]
                        
                        # Remove from cache and hash index
                        logger.info(f"Removing {normalized_path} from cache")
                        self.scanner._hash_index.remove_by_path(normalized_path)
                        cache.raw_data = [
                            item for item in cache.raw_data 
                            if item['file_path'] != normalized_path
                        ]
                        needs_resort = True
                        
                except Exception as e:
                    logger.error(f"Error processing {action} for {file_path}: {e}", exc_info=True)
            
            if needs_resort:
                await cache.resort()
                
                # Update folder list
                all_folders = set(cache.folders) | new_folders
                cache.folders = sorted(list(all_folders), key=lambda x: x.lower())
                
        except Exception as e:
            logger.error(f"Error in process_changes: {e}", exc_info=True)


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