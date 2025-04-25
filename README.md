# ComfyUI LoRA Manager

> **Revolutionize your workflow with the ultimate LoRA companion for ComfyUI!**

[![Discord](https://img.shields.io/discord/1346296675538571315?color=7289DA&label=Discord&logo=discord&logoColor=white)](https://discord.gg/vcqNrWVFvM)
[![Release](https://img.shields.io/github/v/release/willmiao/ComfyUI-Lora-Manager?include_prereleases&color=blue&logo=github)](https://github.com/willmiao/ComfyUI-Lora-Manager/releases)
[![Release Date](https://img.shields.io/github/release-date/willmiao/ComfyUI-Lora-Manager?color=green&logo=github)](https://github.com/willmiao/ComfyUI-Lora-Manager/releases)

A comprehensive toolset that streamlines organizing, downloading, and applying LoRA models in ComfyUI. With powerful features like recipe management, checkpoint organization, and one-click workflow integration, working with models becomes faster, smoother, and significantly easier. Access the interface at: `http://localhost:8188/loras`

![Interface Preview](https://github.com/willmiao/ComfyUI-Lora-Manager/blob/main/static/images/screenshot.png)

## 📺 Tutorial: One-Click LoRA Integration
Watch this quick tutorial to learn how to use the new one-click LoRA integration feature:

[![One-Click LoRA Integration Tutorial](https://img.youtube.com/vi/qS95OjX3e70/0.jpg)](https://youtu.be/qS95OjX3e70)
[![LoRA Manager v0.8.0 - New Recipe Feature & Bulk Operations](https://img.youtube.com/vi/noN7f_ER7yo/0.jpg)](https://youtu.be/noN7f_ER7yo)

---

## Release Notes

### v0.8.9
* **Favorites System** - New functionality to bookmark your favorite LoRAs and checkpoints for quick access and better organization
* **Enhanced UI Controls** - Increased model card button sizes for improved usability and easier interaction
* **Smoother Page Transitions** - Optimized interface switching between pages, eliminating flash issues particularly noticeable in dark theme
* **Bug Fixes & Stability** - Resolved various issues to enhance overall reliability and performance

### v0.8.8
* **Real-time TriggerWord Updates** - Enhanced TriggerWord Toggle node to instantly update when connected Lora Loader or Lora Stacker nodes change, without requiring workflow execution
* **Optimized Metadata Recovery** - Improved utilization of existing .civitai.info files for faster initialization and preservation of metadata from models deleted from CivitAI
* **Migration Acceleration** - Further speed improvements for users transitioning from A1111/Forge environments
* **Bug Fixes & Stability** - Resolved various issues to enhance overall reliability and performance

### v0.8.7
* **Enhanced Context Menu** - Added comprehensive context menu functionality to Recipes and Checkpoints pages for improved workflow
* **Interactive LoRA Strength Control** - Implemented drag functionality in LoRA Loader for intuitive strength adjustment
* **Metadata Collector Overhaul** - Rebuilt metadata collection system with optimized architecture for better performance
* **Improved Save Image Node** - Enhanced metadata capture and image saving performance with the new metadata collector
* **Streamlined Recipe Saving** - Optimized Save Recipe functionality to work independently without requiring Preview Image nodes
* **Bug Fixes & Stability** - Resolved various issues to enhance overall reliability and performance

### v0.8.6 Major Update
* **Checkpoint Management** - Added comprehensive management for model checkpoints including scanning, searching, filtering, and deletion
* **Enhanced Metadata Support** - New capabilities for retrieving and managing checkpoint metadata with improved operations
* **Improved Initial Loading** - Optimized cache initialization with visual progress indicators for better user experience

### v0.8.5
* **Enhanced LoRA & Recipe Connectivity** - Added Recipes tab in LoRA details to see all recipes using a specific LoRA
* **Improved Navigation** - New shortcuts to jump between related LoRAs and Recipes with one-click navigation
* **Video Preview Controls** - Added "Autoplay Videos on Hover" setting to optimize performance and reduce resource usage
* **UI Experience Refinements** - Smoother transitions between related content pages

### v0.8.4
* **Node Layout Improvements** - Fixed layout issues with LoRA Loader and Trigger Words Toggle nodes in newer ComfyUI frontend versions
* **Recipe LoRA Reconnection** - Added ability to reconnect deleted LoRAs in recipes by clicking the "deleted" badge in recipe details
* **Bug Fixes & Stability** - Resolved various issues for improved reliability

### v0.8.3
* **Enhanced Workflow Parser** - Rebuilt workflow analysis engine with improved support for ComfyUI core nodes and easier extensibility
* **Improved Recipe System** - Refined the experimental Save Recipe functionality with better workflow integration
* **New Save Image Node** - Added experimental node with metadata support for perfect CivitAI compatibility
  * Supports dynamic filename prefixes with variables [1](https://github.com/nkchocoai/ComfyUI-SaveImageWithMetaData?tab=readme-ov-file#filename_prefix)
* **Default LoRA Root Setting** - Added configuration option for setting your preferred LoRA directory

### v0.8.2  
* **Faster Initialization for Forge Users** - Improved first-run efficiency by utilizing existing `.json` and `.civitai.info` files from Forge’s CivitAI helper extension, making migration smoother.  
* **LoRA Filename Editing** - Added support for renaming LoRA files directly within LoRA Manager.  
* **Recipe Editing** - Users can now edit recipe names and tags.  
* **Retain Deleted LoRAs in Recipes** - Deleted LoRAs will remain listed in recipes, allowing future functionality to reconnect them once re-obtained.  
* **Download Missing LoRAs from Recipes** - Easily fetch missing LoRAs associated with a recipe.

### v0.8.1
* **Base Model Correction** - Added support for modifying base model associations to fix incorrect metadata for non-CivitAI LoRAs
* **LoRA Loader Flexibility** - Made CLIP input optional for model-only workflows like Hunyuan video generation
* **Expanded Recipe Support** - Added compatibility with 3 additional recipe metadata formats
* **Enhanced Showcase Images** - Generation parameters now displayed alongside LoRA preview images
* **UI Improvements & Bug Fixes** - Various interface refinements and stability enhancements

### v0.8.0
* **Introduced LoRA Recipes** - Create, import, save, and share your favorite LoRA combinations
* **Recipe Management System** - Easily browse, search, and organize your LoRA recipes
* **Workflow Integration** - Save recipes directly from your workflow with generation parameters preserved
* **Simplified Workflow Application** - Quickly apply saved recipes to new projects
* **Enhanced UI & UX** - Improved interface design and user experience
* **Bug Fixes & Stability** - Resolved various issues and enhanced overall performance

[View Update History](./update_logs.md)

---

## **⚠ Important Note**: To use the CivitAI download feature, you'll need to:

1. Get your CivitAI API key from your profile settings
2. Add it to the LoRA Manager settings page
3. Save the settings

---

## Key Features

- 🚀 **High Performance**
  - Fast model loading and browsing
  - Smooth scrolling through large collections
  - Real-time updates when files change
  
- 📂 **Advanced Organization**
  - Quick search with fuzzy matching
  - Folder-based categorization
  - Move LoRAs between folders
  - Sort by name or date
  
- 🌐 **Rich Model Integration**
  - Direct download from CivitAI
  - Preview images and videos
  - Model descriptions and version selection
  - Trigger words at a glance
  - One-click workflow integration with preset values
  
- 🔄 **Checkpoint Management**
  - Scan and organize checkpoint models
  - Filter and search your collection
  - View and edit metadata
  - Clean up and manage disk space
  
- 🧩 **LoRA Recipes**
  - Save and share favorite LoRA combinations
  - Preserve generation parameters for future reference
  - Quick application to workflows
  - Import/export functionality for community sharing
  
- 💻 **User Friendly**
  - One-click access from ComfyUI menu
  - Context menu for quick actions
  - Custom notes and usage tips
  - Multi-folder support
  - Visual progress indicators during initialization

---

## Installation

### Option 1: **ComfyUI Manager** (Recommended)

1. Open **ComfyUI**.
2. Go to **Manager > Custom Node Manager**.
3. Search for `lora-manager`.
4. Click **Install**.

### Option 2: **Manual Installation**

```bash
git clone https://github.com/willmiao/ComfyUI-Lora-Manager.git
cd ComfyUI-Lora-Manager
pip install -r requirements.txt
```

## Usage

1. There are two ways to access the LoRA manager:
   - Click the "Launch LoRA Manager" button in the ComfyUI menu
   - Visit http://localhost:8188/loras directly
2. From the interface, you can:
   - Browse and organize your LoRA models
   - Download models directly from CivitAI
   - Automatically fetch or manually set preview images
   - View and copy trigger words associated with each LoRA
   - Add personal notes and usage tips
3. To use LoRAs in your workflow:
   - Add the "Lora Loader (LoraManager)" node to your workflow
   - Select a LoRA in the manager interface
   - Click copy button or use right-click menu "Copy LoRA syntax"
   - Paste into the Lora Loader node's text input
   - The node will automatically apply preset strength and trigger words

---

## Contributing

Thank you for your interest in contributing to ComfyUI LoRA Manager! As this project is currently in its early stages and undergoing rapid development and refactoring, we are temporarily not accepting pull requests.

However, your feedback and ideas are extremely valuable to us:
- Please feel free to open issues for any bugs you encounter
- Submit feature requests through GitHub issues
- Share your suggestions for improvements

We appreciate your understanding and look forward to potentially accepting code contributions once the project architecture stabilizes.

---

## Credits

This project has been inspired by and benefited from other excellent ComfyUI extensions:

- [ComfyUI-SaveImageWithMetaData](https://github.com/nkchocoai/ComfyUI-SaveImageWithMetaData) - For the image metadata functionality
- [rgthree-comfy](https://github.com/rgthree/rgthree-comfy) - For the lora loader functionality

---

## ☕ Support

If you find this project helpful, consider supporting its development:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/pixelpawsai)

## 💬 Community

Join our Discord community for support, discussions, and updates:
[Discord Server](https://discord.gg/vcqNrWVFvM)

---
