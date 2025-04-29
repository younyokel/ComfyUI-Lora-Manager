NSFW_LEVELS = {
    "PG": 1,
    "PG13": 2,
    "R": 4,
    "X": 8,
    "XXX": 16,
    "Blocked": 32, # Probably not actually visible through the API without being logged in on model owner account?
}

# preview extensions
PREVIEW_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']

# Card preview image width
CARD_PREVIEW_WIDTH = 480

# Width for optimized example images
EXAMPLE_IMAGE_WIDTH = 832

# Supported media extensions for example downloads
SUPPORTED_MEDIA_EXTENSIONS = {
    'images': ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
    'videos': ['.mp4', '.webm']
}