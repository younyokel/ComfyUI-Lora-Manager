# Update History

---

### v0.7.37
* Added NSFW content control settings (blur mature content and SFW-only filter)
* Implemented intelligent blur effects for previews and showcase media
* Added manual content rating option through context menu
* Enhanced user experience with configurable content visibility
* Fixed various bugs and improved stability

### v0.7.36
* Enhanced LoRA details view with model descriptions and tags display
* Added tag filtering system for improved model discovery
* Implemented editable trigger words functionality
* Improved TriggerWord Toggle node with new group mode option for granular control
* Added new Lora Stacker node with cross-compatibility support (works with efficiency nodes, ComfyRoll, easy-use, etc.)
* Fixed several bugs

### v0.7.35-beta
* Added base model filtering
* Implemented bulk operations (copy syntax, move multiple LoRAs)
* Added ability to edit LoRA model names in details view
* Added update checker with notification system
* Added support modal for user feedback and community links

### v0.7.33
* Enhanced LoRA Loader node with visual strength adjustment widgets
* Added toggle switches for LoRA enable/disable
* Implemented image tooltips for LoRA preview
* Added TriggerWord Toggle node with visual word selection
* Fixed various bugs and improved stability

### v0.7.3
* Added "Lora Loader (LoraManager)" custom node for workflows
* Implemented one-click LoRA integration
* Added direct copying of LoRA syntax from manager interface
* Added automatic preset strength value application
* Added automatic trigger word loading

### v0.7.0
* Added direct CivitAI integration for downloading LoRAs
* Implemented version selection for model downloads
* Added target folder selection for downloads
* Added context menu with quick actions
* Added force refresh for CivitAI data
* Implemented LoRA movement between folders
* Added personal usage tips and notes for LoRAs
* Improved performance for details window

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