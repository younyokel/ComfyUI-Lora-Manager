# Update History

---

## [Update 0.5.9] Enhanced Search Capabilities

- 🔍 **Advanced Search Features**:
  - Implemented fuzzy search for more flexible model finding
  - Added recursive search toggle functionality
  - Support for searching in current folder only or all subfolders

---

## [Update 0.5.8] UI Enhancements & Navigation Improvements

- ✨ **Enhanced Navigation**:
  - Added collapsible folder tags with persistent state
  - Implemented "Back to Top" button for easier browsing
  
- 🎨 **UI Refinements**: Various visual improvements and interface optimizations

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