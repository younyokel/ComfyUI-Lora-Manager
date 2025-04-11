NSFW_LEVELS = {
    "PG": 1,
    "PG13": 2,
    "R": 4,
    "X": 8,
    "XXX": 16,
    "Blocked": 32, # Probably not actually visible through the API without being logged in on model owner account?
}

# preview extensions
PREVIEW_EXTENSIONS = [
    '.webp',
    '.preview.webp',
    '.preview.png', 
    '.preview.jpeg', 
    '.preview.jpg', 
    '.preview.mp4',
    '.png', 
    '.jpeg', 
    '.jpg', 
    '.mp4'
]

# Card preview image width
CARD_PREVIEW_WIDTH = 480