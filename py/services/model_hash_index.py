from typing import Dict, Optional, Set

class ModelHashIndex:
    """Index for looking up models by hash or path"""
    
    def __init__(self):
        self._hash_to_path: Dict[str, str] = {}
        self._path_to_hash: Dict[str, str] = {}
    
    def add_entry(self, sha256: str, file_path: str) -> None:
        """Add or update hash index entry"""
        if not sha256 or not file_path:
            return
            
        # Ensure hash is lowercase for consistency
        sha256 = sha256.lower()
        
        # Remove old path mapping if hash exists
        if sha256 in self._hash_to_path:
            old_path = self._hash_to_path[sha256]
            if old_path in self._path_to_hash:
                del self._path_to_hash[old_path]
        
        # Remove old hash mapping if path exists
        if file_path in self._path_to_hash:
            old_hash = self._path_to_hash[file_path]
            if old_hash in self._hash_to_path:
                del self._hash_to_path[old_hash]
        
        # Add new mappings
        self._hash_to_path[sha256] = file_path
        self._path_to_hash[file_path] = sha256
    
    def remove_by_path(self, file_path: str) -> None:
        """Remove entry by file path"""
        if file_path in self._path_to_hash:
            hash_val = self._path_to_hash[file_path]
            if hash_val in self._hash_to_path:
                del self._hash_to_path[hash_val]
            del self._path_to_hash[file_path]
    
    def remove_by_hash(self, sha256: str) -> None:
        """Remove entry by hash"""
        sha256 = sha256.lower()
        if sha256 in self._hash_to_path:
            path = self._hash_to_path[sha256]
            if path in self._path_to_hash:
                del self._path_to_hash[path]
            del self._hash_to_path[sha256]
    
    def has_hash(self, sha256: str) -> bool:
        """Check if hash exists in index"""
        return sha256.lower() in self._hash_to_path
    
    def get_path(self, sha256: str) -> Optional[str]:
        """Get file path for a hash"""
        return self._hash_to_path.get(sha256.lower())
    
    def get_hash(self, file_path: str) -> Optional[str]:
        """Get hash for a file path"""
        return self._path_to_hash.get(file_path)
    
    def clear(self) -> None:
        """Clear all entries"""
        self._hash_to_path.clear()
        self._path_to_hash.clear()
    
    def get_all_hashes(self) -> Set[str]:
        """Get all hashes in the index"""
        return set(self._hash_to_path.keys())
    
    def get_all_paths(self) -> Set[str]:
        """Get all file paths in the index"""
        return set(self._path_to_hash.keys())
    
    def __len__(self) -> int:
        """Get number of entries"""
        return len(self._hash_to_path)