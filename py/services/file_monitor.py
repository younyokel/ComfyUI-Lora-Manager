import os
import logging
import asyncio
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from typing import List, Dict, Set, Optional
from threading import Lock

from ..config import config
from .service_registry import ServiceRegistry

logger = logging.getLogger(__name__)

class BaseFileHandler(FileSystemEventHandler):
    """Base handler for file system events"""
    
    def __init__(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop  # Store event loop reference
        self.pending_changes = set()  # Pending changes
        self.lock = Lock()  # Thread-safe lock
        self.update_task = None  # Async update task
        self._ignore_paths = set()  # Paths to ignore
        self._min_ignore_timeout = 5  # Minimum timeout in seconds
        self._download_speed = 1024 * 1024  # Assume 1MB/s as base speed
        
        # Track modified files with timestamps for debouncing
        self.modified_files: Dict[str, float] = {}
        self.debounce_timer = None
        self.debounce_delay = 3.0  # Seconds to wait after last modification
        
        # Track files already scheduled for processing
        self.scheduled_files: Set[str] = set()
        
        # File extensions to monitor - should be overridden by subclasses
        self.file_extensions = set()

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
            
        # Handle appropriate files based on extensions
        file_ext = os.path.splitext(event.src_path)[1].lower()
        if file_ext in self.file_extensions:
            if self._should_ignore(event.src_path):
                return
            
            # Process this file directly and ignore subsequent modifications
            normalized_path = os.path.realpath(event.src_path).replace(os.sep, '/')
            if normalized_path not in self.scheduled_files:
                logger.info(f"File created: {event.src_path}")
                self.scheduled_files.add(normalized_path)
                self._schedule_update('add', event.src_path)
                
                # Ignore modifications for a short period after creation
                self.loop.call_later(
                    self.debounce_delay * 2,
                    self.scheduled_files.discard,
                    normalized_path
                )
            
    def on_modified(self, event):
        if event.is_directory:
            return
            
        # Only process files with supported extensions
        file_ext = os.path.splitext(event.src_path)[1].lower()
        if file_ext in self.file_extensions:
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
            logger.info(f"Processing modified file: {file_path}")
            self._schedule_update('add', file_path)

    def on_deleted(self, event):
        if event.is_directory:
            return
            
        file_ext = os.path.splitext(event.src_path)[1].lower()
        if file_ext not in self.file_extensions:
            return
            
        if self._should_ignore(event.src_path):
            return
        
        # Remove from scheduled files if present
        normalized_path = os.path.realpath(event.src_path).replace(os.sep, '/')
        self.scheduled_files.discard(normalized_path)
        
        logger.info(f"File deleted: {event.src_path}")
        self._schedule_update('remove', event.src_path)
        
    def on_moved(self, event):
        """Handle file move/rename events"""
        
        src_ext = os.path.splitext(event.src_path)[1].lower()
        dest_ext = os.path.splitext(event.dest_path)[1].lower()
        
        # If destination has supported extension, treat as new file
        if dest_ext in self.file_extensions:
            if self._should_ignore(event.dest_path):
                return
                
            normalized_path = os.path.realpath(event.dest_path).replace(os.sep, '/')
            
            # Only process if not already scheduled
            if normalized_path not in self.scheduled_files:
                logger.info(f"File renamed/moved to: {event.dest_path}")
                self.scheduled_files.add(normalized_path)
                self._schedule_update('add', event.dest_path)
                
                # Auto-remove from scheduled list after reasonable time
                self.loop.call_later(
                    self.debounce_delay * 2, 
                    self.scheduled_files.discard,
                    normalized_path
                )
            
        # If source was a supported file, treat it as deleted
        if src_ext in self.file_extensions:
            if self._should_ignore(event.src_path):
                return
                
            normalized_path = os.path.realpath(event.src_path).replace(os.sep, '/')
            self.scheduled_files.discard(normalized_path)
            
            logger.info(f"File moved/renamed from: {event.src_path}")
            self._schedule_update('remove', event.src_path)

    def _schedule_update(self, action: str, file_path: str):
        """Schedule a cache update"""
        with self.lock:
            # Use config method to map path
            mapped_path = config.map_path_to_link(file_path)
            normalized_path = mapped_path.replace(os.sep, '/')
            self.pending_changes.add((action, normalized_path))
            
            self.loop.call_soon_threadsafe(self._create_update_task)

    def _create_update_task(self):
        """Create update task in the event loop"""
        if self.update_task is None or self.update_task.done():
            self.update_task = asyncio.create_task(self._process_changes())
    
    async def _process_changes(self, delay: float = 2.0):
        """Process pending changes with debouncing - should be implemented by subclasses"""
        raise NotImplementedError("Subclasses must implement _process_changes")


class LoraFileHandler(BaseFileHandler):
    """Handler for LoRA file system events"""
    
    def __init__(self, loop: asyncio.AbstractEventLoop):
        super().__init__(loop)
        # Set supported file extensions for LoRAs
        self.file_extensions = {'.safetensors'}
    
    async def _process_changes(self, delay: float = 2.0):
        """Process pending changes with debouncing"""
        await asyncio.sleep(delay)
        
        try:
            with self.lock:
                changes = self.pending_changes.copy()
                self.pending_changes.clear()
            
            if not changes:
                return
            
            logger.info(f"Processing {len(changes)} LoRA file changes")

            # Get scanner through ServiceRegistry
            scanner = await ServiceRegistry.get_lora_scanner()
            cache = await scanner.get_cached_data()
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
                        model_data = await scanner.scan_single_model(file_path)
                        if model_data:
                            # Update tags count
                            for tag in model_data.get('tags', []):
                                scanner._tags_count[tag] = scanner._tags_count.get(tag, 0) + 1
                            
                            cache.raw_data.append(model_data)
                            new_folders.add(model_data['folder'])
                            # Update hash index
                            if 'sha256' in model_data:
                                scanner._hash_index.add_entry(
                                    model_data['sha256'], 
                                    model_data['file_path']
                                )
                            needs_resort = True
                            
                    elif action == 'remove':
                        # Find the model to remove so we can update tags count
                        model_to_remove = next((item for item in cache.raw_data if item['file_path'] == file_path), None)
                        if model_to_remove:
                            # Update tags count by reducing counts
                            for tag in model_to_remove.get('tags', []):
                                if tag in scanner._tags_count:
                                    scanner._tags_count[tag] = max(0, scanner._tags_count[tag] - 1)
                                    if scanner._tags_count[tag] == 0:
                                        del scanner._tags_count[tag]
                        
                        # Remove from cache and hash index
                        logger.info(f"Removing {file_path} from cache")
                        scanner._hash_index.remove_by_path(file_path)
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
            logger.error(f"Error in process_changes for LoRA: {e}")


class CheckpointFileHandler(BaseFileHandler):
    """Handler for checkpoint file system events"""
    
    def __init__(self, loop: asyncio.AbstractEventLoop):
        super().__init__(loop)
        # Set supported file extensions for checkpoints
        self.file_extensions = {'.safetensors', '.ckpt', '.pt', '.pth', '.sft', '.gguf'}
    
    async def _process_changes(self, delay: float = 2.0):
        """Process pending changes with debouncing for checkpoint files"""
        await asyncio.sleep(delay)
        
        try:
            with self.lock:
                changes = self.pending_changes.copy()
                self.pending_changes.clear()
            
            if not changes:
                return
            
            logger.info(f"Processing {len(changes)} checkpoint file changes")

            # Get scanner through ServiceRegistry
            scanner = await ServiceRegistry.get_checkpoint_scanner()
            cache = await scanner.get_cached_data()
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
                        model_data = await scanner.scan_single_model(file_path)
                        if model_data:
                            # Update tags count if applicable
                            for tag in model_data.get('tags', []):
                                scanner._tags_count[tag] = scanner._tags_count.get(tag, 0) + 1
                            
                            cache.raw_data.append(model_data)
                            new_folders.add(model_data['folder'])
                            # Update hash index
                            if 'sha256' in model_data:
                                scanner._hash_index.add_entry(
                                    model_data['sha256'], 
                                    model_data['file_path']
                                )
                            needs_resort = True
                            
                    elif action == 'remove':
                        # Find the model to remove so we can update tags count
                        model_to_remove = next((item for item in cache.raw_data if item['file_path'] == file_path), None)
                        if model_to_remove:
                            # Update tags count by reducing counts
                            for tag in model_to_remove.get('tags', []):
                                if tag in scanner._tags_count:
                                    scanner._tags_count[tag] = max(0, scanner._tags_count[tag] - 1)
                                    if scanner._tags_count[tag] == 0:
                                        del scanner._tags_count[tag]
                        
                        # Remove from cache and hash index
                        logger.info(f"Removing {file_path} from checkpoint cache")
                        scanner._hash_index.remove_by_path(file_path)
                        cache.raw_data = [
                            item for item in cache.raw_data 
                            if item['file_path'] != file_path
                        ]
                        needs_resort = True
                        
                except Exception as e:
                    logger.error(f"Error processing checkpoint {action} for {file_path}: {e}")
            
            if needs_resort:
                await cache.resort()
                
                # Update folder list
                all_folders = set(cache.folders) | new_folders
                cache.folders = sorted(list(all_folders), key=lambda x: x.lower())
                
        except Exception as e:
            logger.error(f"Error in process_changes for checkpoint: {e}")


class BaseFileMonitor:
    """Base class for file monitoring"""
    
    def __init__(self, monitor_paths: List[str]):
        self.observer = Observer()
        self.loop = asyncio.get_event_loop()
        self.monitor_paths = set()
        
        # Process monitor paths
        for path in monitor_paths:
            self.monitor_paths.add(os.path.realpath(path).replace(os.sep, '/'))

        # Add mapped paths from config
        for target_path in config._path_mappings.keys():
            self.monitor_paths.add(target_path)
    
    def start(self):
        """Start file monitoring"""
        for path in self.monitor_paths:
            try:
                self.observer.schedule(self.handler, path, recursive=True)
                logger.info(f"Started monitoring: {path}")
            except Exception as e:
                logger.error(f"Error monitoring {path}: {e}")
                
        self.observer.start()
    
    def stop(self):
        """Stop file monitoring"""
        self.observer.stop()
        self.observer.join()
    
    def rescan_links(self):
        """Rescan links when new ones are added"""
        # Find new paths not yet being monitored
        new_paths = set()
        for path in config._path_mappings.keys():
            real_path = os.path.realpath(path).replace(os.sep, '/')
            if real_path not in self.monitor_paths:
                new_paths.add(real_path)
                self.monitor_paths.add(real_path)
        
        # Add new paths to monitoring
        for path in new_paths:
            try:
                self.observer.schedule(self.handler, path, recursive=True)
                logger.info(f"Added new monitoring path: {path}")
            except Exception as e:
                logger.error(f"Error adding new monitor for {path}: {e}")


class LoraFileMonitor(BaseFileMonitor):
    """Monitor for LoRA file changes"""
    
    _instance = None
    _lock = asyncio.Lock()
    
    def __new__(cls, monitor_paths=None):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self, monitor_paths=None):
        if not hasattr(self, '_initialized'):
            if monitor_paths is None:
                from ..config import config
                monitor_paths = config.loras_roots
                
            super().__init__(monitor_paths)
            self.handler = LoraFileHandler(self.loop)
            self._initialized = True
    
    @classmethod
    async def get_instance(cls):
        """Get singleton instance with async support"""
        async with cls._lock:
            if cls._instance is None:
                from ..config import config
                cls._instance = cls(config.loras_roots)
            return cls._instance


class CheckpointFileMonitor(BaseFileMonitor):
    """Monitor for checkpoint file changes"""
    
    _instance = None
    _lock = asyncio.Lock()
    
    def __new__(cls, monitor_paths=None):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self, monitor_paths=None):
        if not hasattr(self, '_initialized'):
            if monitor_paths is None:
                # Get checkpoint roots from scanner
                monitor_paths = []
                # We'll initialize monitor paths later when scanner is available
                
            super().__init__(monitor_paths or [])
            self.handler = CheckpointFileHandler(self.loop)
            self._initialized = True
    
    @classmethod
    async def get_instance(cls):
        """Get singleton instance with async support"""
        async with cls._lock:
            if cls._instance is None:
                cls._instance = cls([])
                
                # Now get checkpoint roots from scanner
                from .checkpoint_scanner import CheckpointScanner
                scanner = await CheckpointScanner.get_instance()
                monitor_paths = scanner.get_model_roots()
                
                # Update monitor paths
                for path in monitor_paths:
                    real_path = os.path.realpath(path).replace(os.sep, '/')
                    cls._instance.monitor_paths.add(real_path)
                
            return cls._instance
    
    async def initialize_paths(self):
        """Initialize monitor paths from scanner"""
        if not self.monitor_paths:
            scanner = await ServiceRegistry.get_checkpoint_scanner()
            monitor_paths = scanner.get_model_roots()
            
            # Update monitor paths
            for path in monitor_paths:
                real_path = os.path.realpath(path).replace(os.sep, '/')
                self.monitor_paths.add(real_path)