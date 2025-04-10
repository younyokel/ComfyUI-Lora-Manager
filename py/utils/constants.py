NSFW_LEVELS = {
    "PG": 1,
    "PG13": 2,
    "R": 4,
    "X": 8,
    "XXX": 16,
    "Blocked": 32, # Probably not actually visible through the API without being logged in on model owner account?
}

# 预览文件扩展名
PREVIEW_EXTENSIONS = [
    '.preview.png', 
    '.preview.jpeg', 
    '.preview.jpg', 
    '.preview.webp',
    '.preview.mp4',
    '.png', 
    '.jpeg', 
    '.jpg', 
    '.webp',
    '.mp4'
]