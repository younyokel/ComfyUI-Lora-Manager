from difflib import SequenceMatcher
import requests
import tempfile
import re
from bs4 import BeautifulSoup

def download_twitter_image(url):
    """Download image from a URL containing twitter:image meta tag
    
    Args:
        url (str): The URL to download image from
        
    Returns:
        str: Path to downloaded temporary image file
    """
    try:
        # Download page content
        response = requests.get(url)
        response.raise_for_status()
        
        # Parse HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find twitter:image meta tag
        meta_tag = soup.find('meta', attrs={'property': 'twitter:image'})
        if not meta_tag:
            return None
            
        image_url = meta_tag['content']
        
        # Download image
        image_response = requests.get(image_url)
        image_response.raise_for_status()
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp_file:
            temp_file.write(image_response.content)
            return temp_file.name
            
    except Exception as e:
        print(f"Error downloading twitter image: {e}")
        return None

def download_civitai_image(url):
    """Download image from a URL containing avatar image with specific class and style attributes
    
    Args:
        url (str): The URL to download image from
        
    Returns:
        str: Path to downloaded temporary image file
    """
    try:
        # Download page content
        response = requests.get(url)
        response.raise_for_status()
        
        # Parse HTML
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find image with specific class and style attributes
        image = soup.select_one('img.EdgeImage_image__iH4_q.max-h-full.w-auto.max-w-full')
        
        if not image or 'src' not in image.attrs:
            return None
            
        image_url = image['src']
        
        # Download image
        image_response = requests.get(image_url)
        image_response.raise_for_status()
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp_file:
            temp_file.write(image_response.content)
            return temp_file.name
            
    except Exception as e:
        print(f"Error downloading civitai avatar: {e}")
        return None

def fuzzy_match(text: str, pattern: str, threshold: float = 0.7) -> bool:
        """
        Check if text matches pattern using fuzzy matching.
        Returns True if similarity ratio is above threshold.
        """
        if not pattern or not text:
            return False
        
        # Convert both to lowercase for case-insensitive matching
        text = text.lower()
        pattern = pattern.lower()
        
        # Split pattern into words
        search_words = pattern.split()
        
        # Check each word
        for word in search_words:
            # First check if word is a substring (faster)
            if word in text:
                continue
            
            # If not found as substring, try fuzzy matching
            # Check if any part of the text matches this word
            found_match = False
            for text_part in text.split():
                ratio = SequenceMatcher(None, text_part, word).ratio()
                if ratio >= threshold:
                    found_match = True
                    break
                
            if not found_match:
                return False
        
        # All words found either as substrings or fuzzy matches
        return True

def calculate_recipe_fingerprint(loras):
    """
    Calculate a unique fingerprint for a recipe based on its LoRAs.
    
    The fingerprint is created by sorting LoRA hashes, filtering invalid entries,
    normalizing strength values to 2 decimal places, and joining in format:
    hash1:strength1|hash2:strength2|...
    
    Args:
        loras (list): List of LoRA dictionaries with hash and strength values
        
    Returns:
        str: The calculated fingerprint
    """
    if not loras:
        return ""
    
    # Filter valid entries and extract hash and strength
    valid_loras = []
    for lora in loras:
        # Skip excluded loras
        if lora.get("exclude", False):
            continue
            
        # Get the hash - use modelVersionId as fallback if hash is empty
        hash_value = lora.get("hash", "").lower()
        if not hash_value and lora.get("isDeleted", False) and lora.get("modelVersionId"):
            hash_value = lora.get("modelVersionId")
            
        # Skip entries without a valid hash
        if not hash_value:
            continue
            
        # Normalize strength to 2 decimal places
        strength = round(float(lora.get("strength", 1.0)), 2)
        
        valid_loras.append((hash_value, strength))
    
    # Sort by hash
    valid_loras.sort()
    
    # Join in format hash1:strength1|hash2:strength2|...
    fingerprint = "|".join([f"{hash_value}:{strength}" for hash_value, strength in valid_loras])
    
    return fingerprint
