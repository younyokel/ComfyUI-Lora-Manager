# ComfyUI LoRA Manager

A web-based management interface designed to help you organize and manage your local LoRA models in ComfyUI. Access the interface at: `http://localhost:8188/loras`

![Interface Preview](https://github.com/willmiao/ComfyUI-Lora-Manager/blob/main/static/images/Screenshot%202025-01-27%20172349.png)

---

## [Update 0.5.7] Performance Boost & Search Feature

- 🚀 **Major Performance Improvements**:
  - Implemented multi-layer caching and cache preloading
  - Added file system monitoring with incremental updates
  - Introduced pagination API with infinite scroll support
  
- 🔍 **Search Functionality**: New search feature to quickly find LoRA models
- 🐛 **Bug Fixes**: Various stability and performance improvements

---

## [Update 0.5.6] New Features and Optimizations

- 🛠️ **Code Refactor**: The codebase has been restructured to improve readability and maintainability, making it easier to manage and extend in future updates.

- 🚀 **Frontend Enhancements**: Significant performance improvements and refined user experience, including a more intuitive process for selecting and copying trigger words.

- 🔘 **New Menu Button**: A button has been added to the ComfyUI menu. Clicking it will open the LoRA Manager interface in a new window for quicker access.

---

## [Update 0.5.4] Support for Extra LoRA Paths via `extra_model_paths.yaml`

- 🛠️ **Extra LoRA Paths**: Additional flexibility has been introduced by supporting extra LoRA paths through the `extra_model_paths.yaml` file, allowing you to manage LoRAs from directories outside the default folder.

---

## [Update 0.5.3] Improved Preview Handling & Trigger Words Support

- ✅ **Smarter Preview Image Handling**: The manager now automatically scans for and uses existing local preview images. If a local preview is found, it will not re-download one from CivitAI when fetching model details, saving both time and bandwidth.

- 📝 **Trigger Words in LoRA Details**: Trigger words are now directly visible in the LoRA details window, making it easier to copy and integrate them into your workflows.

- ⚠️ **Note**: For automatic detection, ensure your local preview images are named using one of the following formats:
  - `<lora-file-name>.[png|jpg|jpeg|mp4]`
  - `<lora-file-name>.preview.[png|jpg|jpeg|mp4]`

---

## Key Features

- 🚀 **High Performance**
  - Fast model loading and browsing
  - Smooth scrolling through large collections
  - Real-time updates when files change
  
- 📂 **Easy Organization**
  - Quick search to find models
  - Folder-based categorization
  - Sort by name or date
  
- 🌐 **Rich Model Details**
  - Preview images and videos
  - Model descriptions from CivitAI
  - Trigger words at a glance
  
- 💻 **User Friendly**
  - One-click access from ComfyUI menu
  - Copy model names with single click
  - Customizable light/dark theme
  - Multi-folder support

---

## Installation

### Option 1: **ComfyUI Manager** (Recommended)

1. Open **ComfyUI**.
2. Go to **Manager > Custom Node Manager**.
3. Search for `lora-manager`.
4. Click **Install**.

### Option 2: **Manual Installation**

1. Clone the repository:

```bash
git clone https://github.com/willmiao/ComfyUI-Lora-Manager.git
```

2. Follow the setup instructions in the repository for manual installation.

## Usage

1. Once installed, access the LoRA manager at [http://localhost:8188/loras](http://localhost:8188/loras).
2. From the interface, you can:
   - Browse and organize your LoRA models.
   - Automatically fetch or manually set preview images.
   - View and copy trigger words associated with each LoRA.
   - Toggle between light and dark themes.

---

## Contributing

If you have suggestions, bug reports, or improvements, feel free to open an issue or contribute directly to the codebase. Pull requests are always welcome!

