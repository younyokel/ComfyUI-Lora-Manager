from typing import Dict, Optional, Set, List
import os

class ModelHashIndex:
    """Index for looking up models by hash or path"""
    
    def __init__(self):
        self._hash_to_path: Dict[str, str] = {}
        self._filename_to_hash: Dict[str, str] = {}
        # New data structures for tracking duplicates
        self._duplicate_hashes: Dict[str, List[str]] = {}  # sha256 -> list of paths
        self._duplicate_filenames: Dict[str, List[str]] = {}  # filename -> list of paths
    
    def add_entry(self, sha256: str, file_path: str) -> None:
        """Add or update hash index entry"""
        if not sha256 or not file_path:
            return
            
        # Ensure hash is lowercase for consistency
        sha256 = sha256.lower()
        
        # Extract filename without extension
        filename = self._get_filename_from_path(file_path)
        
        # Track duplicates by hash
        if sha256 in self._hash_to_path:
            old_path = self._hash_to_path[sha256]
            if old_path != file_path:  # Only record if it's actually a different path
                if sha256 not in self._duplicate_hashes:
                    self._duplicate_hashes[sha256] = [old_path]
                if file_path not in self._duplicate_hashes.get(sha256, []):
                    self._duplicate_hashes.setdefault(sha256, []).append(file_path)
        
        # Track duplicates by filename
        if filename in self._filename_to_hash:
            old_hash = self._filename_to_hash[filename]
            if old_hash != sha256:  # Different models with the same name
                old_path = self._hash_to_path.get(old_hash)
                if old_path:
                    if filename not in self._duplicate_filenames:
                        self._duplicate_filenames[filename] = [old_path]
                    if file_path not in self._duplicate_filenames.get(filename, []):
                        self._duplicate_filenames.setdefault(filename, []).append(file_path)
        
        # Remove old path mapping if hash exists
        if sha256 in self._hash_to_path:
            old_path = self._hash_to_path[sha256]
            old_filename = self._get_filename_from_path(old_path)
            if old_filename in self._filename_to_hash:
                del self._filename_to_hash[old_filename]
        
        # Remove old hash mapping if filename exists
        if filename in self._filename_to_hash:
            old_hash = self._filename_to_hash[filename]
            if old_hash in self._hash_to_path:
                del self._hash_to_path[old_hash]
        
        # Add new mappings
        self._hash_to_path[sha256] = file_path
        self._filename_to_hash[filename] = sha256
    
    def _get_filename_from_path(self, file_path: str) -> str:
        """Extract filename without extension from path"""
        return os.path.splitext(os.path.basename(file_path))[0]
    
    def remove_by_path(self, file_path: str) -> None:
        """Remove entry by file path"""
        filename = self._get_filename_from_path(file_path)
        if filename in self._filename_to_hash:
            hash_val = self._filename_to_hash[filename]
            if hash_val in self._hash_to_path:
                del self._hash_to_path[hash_val]
            del self._filename_to_hash[filename]
            
            # Also clean up from duplicates tracking
            if filename in self._duplicate_filenames:
                self._duplicate_filenames[filename] = [p for p in self._duplicate_filenames[filename] if p != file_path]
                if not self._duplicate_filenames[filename]:
                    del self._duplicate_filenames[filename]
            
            if hash_val in self._duplicate_hashes:
                self._duplicate_hashes[hash_val] = [p for p in self._duplicate_hashes[hash_val] if p != file_path]
                if not self._duplicate_hashes[hash_val]:
                    del self._duplicate_hashes[hash_val]
    
    def remove_by_hash(self, sha256: str) -> None:
        """Remove entry by hash"""
        sha256 = sha256.lower()
        if sha256 in self._hash_to_path:
            path = self._hash_to_path[sha256]
            filename = self._get_filename_from_path(path)
            if filename in self._filename_to_hash:
                del self._filename_to_hash[filename]
            del self._hash_to_path[sha256]
            
            # Clean up from duplicates tracking
            if sha256 in self._duplicate_hashes:
                del self._duplicate_hashes[sha256]
    
    def has_hash(self, sha256: str) -> bool:
        """Check if hash exists in index"""
        return sha256.lower() in self._hash_to_path
    
    def get_path(self, sha256: str) -> Optional[str]:
        """Get file path for a hash"""
        return self._hash_to_path.get(sha256.lower())
    
    def get_hash(self, file_path: str) -> Optional[str]:
        """Get hash for a file path"""
        filename = self._get_filename_from_path(file_path)
        return self._filename_to_hash.get(filename)
    
    def get_hash_by_filename(self, filename: str) -> Optional[str]:
        """Get hash for a filename without extension"""
        # Strip extension if present to make the function more flexible
        filename = os.path.splitext(filename)[0]
        return self._filename_to_hash.get(filename)
    
    def clear(self) -> None:
        """Clear all entries"""
        self._hash_to_path.clear()
        self._filename_to_hash.clear()
        self._duplicate_hashes.clear()
        self._duplicate_filenames.clear()
    
    def get_all_hashes(self) -> Set[str]:
        """Get all hashes in the index"""
        return set(self._hash_to_path.keys())
    
    def get_all_filenames(self) -> Set[str]:
        """Get all filenames in the index"""
        return set(self._filename_to_hash.keys())
    
    def get_duplicate_hashes(self) -> Dict[str, List[str]]:
        """Get dictionary of duplicate hashes and their paths"""
        return self._duplicate_hashes
    
    def get_duplicate_filenames(self) -> Dict[str, List[str]]:
        """Get dictionary of duplicate filenames and their paths"""
        return self._duplicate_filenames
    
    def __len__(self) -> int:
        """Get number of entries"""
        return len(self._hash_to_path)