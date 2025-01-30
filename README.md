# ComfyUI LoRA Manager

A web-based management interface for organizing and managing your local LoRA models in ComfyUI. Access it via: `http://localhost:8188/loras`

![Interface Preview](https://github.com/willmiao/ComfyUI-Lora-Manager/blob/main/static/images/Screenshot%202025-01-27%20172349.png)

---

## [Update 0.5.4] Support for Extra LoRA Paths via `extra_model_paths.yaml`

- 🛠️ **Extra LoRA Paths**: Support for additional LoRA paths via extra_model_paths.yaml is now available, offering greater flexibility in managing LoRAs located outside the default directory.

---

## [Update 0.5.3] Improved Preview Handling & Trigger Words Support

- ✅ **Smarter Preview Image Handling**: The manager now automatically scans for and uses existing local preview images. If a local preview is found, it will not re-download one from CivitAI when fetching model details, saving time and bandwidth.

- 📝 **Trigger Words in LoRA Details**: Trigger words are now visible in the LoRA details window, making it easier to copy and use them for your workflows.

- ⚠️ **Note**: For automatic detection, ensure your existing local preview images are named in the following formats:
  - `<lora-file-name>.[png|jpg|jpeg|mp4]`
  - `<lora-file-name>.preview.[png|jpg|jpeg|mp4]`

---

## Key Features

- **🔍 Automatic scanning & listing** of local LoRA models
- **📂 Folder-based categorization** with support for nested directories
- **🌐 Metadata retrieval** from CivitAI, including preview images
- **🖼️ Manual preview replacement** with support for JPG, PNG, MP4, and WEBM formats
- **📋 One-click filename copying** for easy workflow integration
- **↕️ Sorting** by name or modification date
- **🌓 Light/dark theme toggle** for user preference

---

## Installation

### Option 1: **ComfyUI Manager** (Recommended)

1. Open **ComfyUI**.
2. Navigate to **Manager > Custom Node Manager**.
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

