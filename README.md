# ComfyUI LoRA Manager

A web-based management interface designed to help you organize and manage your local LoRA models in ComfyUI. Access the interface at: `http://localhost:8188/loras`

![Interface Preview](https://github.com/willmiao/ComfyUI-Lora-Manager/blob/main/static/images/Screenshot%202025-01-27%20172349.png)

---

## [Update 0.5.9] Enhanced Search Capabilities

- 🔍 **Advanced Search Features**:
  - Implemented fuzzy search for more flexible model finding
  - Added recursive search toggle functionality
  - Support for searching in current folder only or all subfolders

[View Update History](./update_logs.md)

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

```bash
git clone https://github.com/willmiao/ComfyUI-Lora-Manager.git
cd ComfyUI-Lora-Manager
pip install requirements.txt
```

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

