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
