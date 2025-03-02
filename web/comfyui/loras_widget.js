import { api } from "../../scripts/api.js";

export function addLorasWidget(node, name, opts, callback) {
  // Create container for loras
  const container = document.createElement("div");
  container.className = "comfy-loras-container";
  Object.assign(container.style, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "6px",
    backgroundColor: "rgba(40, 44, 52, 0.6)",
    borderRadius: "6px",
    width: "100%",
  });

  // Initialize default value
  const defaultValue = opts?.defaultVal || [];

  // Parse LoRA entries from value
  const parseLoraValue = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [];
  };

  // Format LoRA data
  const formatLoraValue = (loras) => {
    return loras;
  };

  // Function to create toggle element
  const createToggle = (active, onChange) => {
    const toggle = document.createElement("div");
    toggle.className = "comfy-lora-toggle";
    
    updateToggleStyle(toggle, active);
    
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      onChange(!active);
    });
    
    return toggle;
  };

  // Helper function to update toggle style
  function updateToggleStyle(toggleEl, active) {
    Object.assign(toggleEl.style, {
      width: "18px",
      height: "18px",
      borderRadius: "4px",
      cursor: "pointer",
      transition: "all 0.2s ease",
      backgroundColor: active ? "rgba(66, 153, 225, 0.9)" : "rgba(45, 55, 72, 0.7)",
      border: `1px solid ${active ? "rgba(66, 153, 225, 0.9)" : "rgba(226, 232, 240, 0.2)"}`,
    });

    // Add hover effect
    toggleEl.onmouseenter = () => {
      toggleEl.style.transform = "scale(1.05)";
      toggleEl.style.boxShadow = "0 2px 4px rgba(0,0,0,0.15)";
    };

    toggleEl.onmouseleave = () => {
      toggleEl.style.transform = "scale(1)";
      toggleEl.style.boxShadow = "none";
    };
  }

  // Create arrow button for strength adjustment
  const createArrowButton = (direction, onClick) => {
    const button = document.createElement("div");
    button.className = `comfy-lora-arrow comfy-lora-arrow-${direction}`;
    
    Object.assign(button.style, {
      width: "16px",
      height: "16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      userSelect: "none",
      fontSize: "12px",
      color: "rgba(226, 232, 240, 0.8)",
      transition: "all 0.2s ease",
    });
    
    button.textContent = direction === "left" ? "◀" : "▶";
    
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    
    // Add hover effect
    button.onmouseenter = () => {
      button.style.color = "white";
      button.style.transform = "scale(1.2)";
    };
    
    button.onmouseleave = () => {
      button.style.color = "rgba(226, 232, 240, 0.8)";
      button.style.transform = "scale(1)";
    };
    
    return button;
  };

  // 添加预览弹窗组件
  class PreviewTooltip {
    constructor() {
      this.element = document.createElement('div');
      Object.assign(this.element.style, {
        position: 'fixed',
        zIndex: 9999,
        padding: '4px', // 减小内边距
        background: 'rgba(0, 0, 0, 0.75)', // 稍微调整透明度
        borderRadius: '4px', // 减小圆角
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)', // 减小阴影
        display: 'none',
        maxWidth: '300px',
        maxHeight: '300px',
      });
      document.body.appendChild(this.element);
      this.hideTimeout = null;  // 添加超时处理变量
    }

    async show(loraName, x, y) {
      try {
        // 清除之前的隐藏定时器
        if (this.hideTimeout) {
          clearTimeout(this.hideTimeout);
          this.hideTimeout = null;
        }
        // 获取预览URL
        const response = await api.fetchApi(`/lora-preview-url?name=${encodeURIComponent(loraName)}`, {
          method: 'GET'
        });

        if (!response.ok) {
          throw new Error('Failed to fetch preview URL');
        }

        const data = await response.json();
        if (!data.success || !data.preview_url) {
          throw new Error('No preview available');
        }

        // 清除现有内容
        while (this.element.firstChild) {
          this.element.removeChild(this.element.firstChild);
        }

        // 判断是否为视频
        const isVideo = data.preview_url.endsWith('.mp4');
        const mediaElement = isVideo ? 
          document.createElement('video') : 
          document.createElement('img');

        Object.assign(mediaElement.style, {
          maxWidth: '300px',
          maxHeight: '300px',
          objectFit: 'contain'
        });

        if (isVideo) {
          mediaElement.autoplay = true;
          mediaElement.loop = true;
          mediaElement.muted = true;
          mediaElement.controls = false;
        }

        mediaElement.src = data.preview_url;

        this.element.appendChild(mediaElement);
        this.position(x, y);
        this.element.style.display = 'block';
      } catch (error) {
        console.warn('Failed to load preview:', error);
      }
    }

    position(x, y) {
      // 确保预览框不超出视窗边界
      const rect = this.element.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = x + 10; // 默认在鼠标右侧偏移10px
      let top = y + 10;  // 默认在鼠标下方偏移10px

      // 检查右边界
      if (left + rect.width > viewportWidth) {
        left = x - rect.width - 10;
      }

      // 检查下边界
      if (top + rect.height > viewportHeight) {
        top = y - rect.height - 10;
      }

      Object.assign(this.element.style, {
        left: `${left}px`,
        top: `${top}px`
      });
    }

    hide() {
      // 使用延迟来确保隐藏事件在显示事件之后执行
      this.hideTimeout = setTimeout(() => {
        this.element.style.display = 'none';
        // 停止视频播放
        const video = this.element.querySelector('video');
        if (video) {
          video.pause();
        }
        this.hideTimeout = null;
      }, 50);
    }

    cleanup() {
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
      }
      this.element.remove();
    }
  }

  // 创建预览tooltip实例
  const previewTooltip = new PreviewTooltip();

  // Function to render loras from data
  const renderLoras = (value, widget) => {
    // Clear existing content
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Parse the loras data
    const lorasData = parseLoraValue(value);

    if (lorasData.length === 0) {
      // Show message when no loras are added
      const emptyMessage = document.createElement("div");
      emptyMessage.textContent = "No LoRAs added";
      Object.assign(emptyMessage.style, {
        textAlign: "center",
        padding: "20px 0",
        color: "rgba(226, 232, 240, 0.8)",
        fontStyle: "italic",
        userSelect: "none",     // Add this line to prevent text selection
        WebkitUserSelect: "none",  // For Safari support
        MozUserSelect: "none",     // For Firefox support
        msUserSelect: "none",      // For IE/Edge support
      });
      container.appendChild(emptyMessage);
      return;
    }

    // Create header
    const header = document.createElement("div");
    header.className = "comfy-loras-header";
    Object.assign(header.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "4px 8px",
      borderBottom: "1px solid rgba(226, 232, 240, 0.2)",
      marginBottom: "8px"
    });

    // Add toggle all control
    const allActive = lorasData.every(lora => lora.active);
    const toggleAll = createToggle(allActive, (active) => {
      // Update all loras active state
      const lorasData = parseLoraValue(widget.value);
      lorasData.forEach(lora => lora.active = active);
      
      const newValue = formatLoraValue(lorasData);
      widget.value = newValue;
    });

    // Add label to toggle all
    const toggleLabel = document.createElement("div");
    toggleLabel.textContent = "Toggle All";
    Object.assign(toggleLabel.style, {
      color: "rgba(226, 232, 240, 0.8)",
      fontSize: "13px",
      marginLeft: "8px",
      userSelect: "none",     // Add this line to prevent text selection
      WebkitUserSelect: "none",  // For Safari support
      MozUserSelect: "none",     // For Firefox support
      msUserSelect: "none",      // For IE/Edge support
    });

    const toggleContainer = document.createElement("div");
    Object.assign(toggleContainer.style, {
      display: "flex",
      alignItems: "center",
    });
    toggleContainer.appendChild(toggleAll);
    toggleContainer.appendChild(toggleLabel);

    // Strength label
    const strengthLabel = document.createElement("div");
    strengthLabel.textContent = "Strength";
    Object.assign(strengthLabel.style, {
      color: "rgba(226, 232, 240, 0.8)",
      fontSize: "13px",
      marginRight: "8px",
      userSelect: "none",     // Add this line to prevent text selection
      WebkitUserSelect: "none",  // For Safari support
      MozUserSelect: "none",     // For Firefox support
      msUserSelect: "none",      // For IE/Edge support
    });

    header.appendChild(toggleContainer);
    header.appendChild(strengthLabel);
    container.appendChild(header);

    // Render each lora entry
    lorasData.forEach((loraData) => {
      const { name, strength, active } = loraData;
      
      const loraEl = document.createElement("div");
      loraEl.className = "comfy-lora-entry";
      Object.assign(loraEl.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px",
        borderRadius: "6px",
        backgroundColor: active ? "rgba(45, 55, 72, 0.7)" : "rgba(35, 40, 50, 0.5)",
        transition: "all 0.2s ease",
        marginBottom: "6px",
      });

      // Create toggle for this lora
      const toggle = createToggle(active, (newActive) => {
        // Update this lora's active state
        const lorasData = parseLoraValue(widget.value);
        const loraIndex = lorasData.findIndex(l => l.name === name);
        
        if (loraIndex >= 0) {
          lorasData[loraIndex].active = newActive;
          
          const newValue = formatLoraValue(lorasData);
          widget.value = newValue;
        }
      });

      // Create name display
      const nameEl = document.createElement("div");
      nameEl.textContent = name;
      nameEl.title = name; // Set tooltip for full name
      Object.assign(nameEl.style, {
        marginLeft: "10px",
        flex: "1",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: active ? "rgba(226, 232, 240, 0.9)" : "rgba(226, 232, 240, 0.6)",
        fontSize: "13px",
        cursor: "pointer", // Add pointer cursor to indicate hoverable area
        userSelect: "none",     // Add this line to prevent text selection
        WebkitUserSelect: "none",  // For Safari support
        MozUserSelect: "none",     // For Firefox support
        msUserSelect: "none",      // For IE/Edge support
      });

      // Move preview tooltip events to nameEl instead of loraEl
      nameEl.addEventListener('mouseenter', async (e) => {
        e.stopPropagation(); // 阻止事件冒泡
        await previewTooltip.show(name, e.clientX, e.clientY);
      });

      nameEl.addEventListener('mousemove', (e) => {
        e.stopPropagation(); // 阻止事件冒泡
        if (previewTooltip.element.style.display === 'block') {
          previewTooltip.position(e.clientX, e.clientY);
        }
      });

      nameEl.addEventListener('mouseleave', (e) => {
        e.stopPropagation(); // 阻止事件冒泡
        previewTooltip.hide();
      });

      // Remove the preview tooltip events from loraEl
      loraEl.onmouseenter = () => {
        loraEl.style.backgroundColor = active ? "rgba(50, 60, 80, 0.8)" : "rgba(40, 45, 55, 0.6)";
      };
      
      loraEl.onmouseleave = () => {
        loraEl.style.backgroundColor = active ? "rgba(45, 55, 72, 0.7)" : "rgba(35, 40, 50, 0.5)";
      };

      // Create strength control
      const strengthControl = document.createElement("div");
      Object.assign(strengthControl.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
      });

      // Left arrow
      const leftArrow = createArrowButton("left", () => {
        // Decrease strength
        const lorasData = parseLoraValue(widget.value);
        const loraIndex = lorasData.findIndex(l => l.name === name);
        
        if (loraIndex >= 0) {
          lorasData[loraIndex].strength = (lorasData[loraIndex].strength - 0.05).toFixed(2);
          
          const newValue = formatLoraValue(lorasData);
          widget.value = newValue;
        }
      });

      // Strength display
      const strengthEl = document.createElement("input");
      strengthEl.type = "text";
      strengthEl.value = typeof strength === 'number' ? strength.toFixed(2) : Number(strength).toFixed(2);
      Object.assign(strengthEl.style, {
        minWidth: "50px",
        width: "50px",
        textAlign: "center",
        color: active ? "rgba(226, 232, 240, 0.9)" : "rgba(226, 232, 240, 0.6)",
        fontSize: "13px",
        background: "none",
        border: "1px solid transparent",
        padding: "2px 4px",
        borderRadius: "3px",
        outline: "none",
      });

      // 添加hover效果
      strengthEl.addEventListener('mouseenter', () => {
        strengthEl.style.border = "1px solid rgba(226, 232, 240, 0.2)";
      });

      strengthEl.addEventListener('mouseleave', () => {
        if (document.activeElement !== strengthEl) {
          strengthEl.style.border = "1px solid transparent";
        }
      });

      // 处理焦点
      strengthEl.addEventListener('focus', () => {
        strengthEl.style.border = "1px solid rgba(66, 153, 225, 0.6)";
        strengthEl.style.background = "rgba(0, 0, 0, 0.2)";
        // 自动选中所有内容
        strengthEl.select();
      });

      strengthEl.addEventListener('blur', () => {
        strengthEl.style.border = "1px solid transparent";
        strengthEl.style.background = "none";
      });

      // 处理输入变化
      strengthEl.addEventListener('change', () => {
        let newValue = parseFloat(strengthEl.value);
        
        // 验证输入
        if (isNaN(newValue)) {
          newValue = 1.0;
        }
        
        // 更新数值
        const lorasData = parseLoraValue(widget.value);
        const loraIndex = lorasData.findIndex(l => l.name === name);
        
        if (loraIndex >= 0) {
          lorasData[loraIndex].strength = newValue.toFixed(2);
          
          // 更新值并触发回调
          const newLorasValue = formatLoraValue(lorasData);
          widget.value = newLorasValue;
        }
      });

      // 处理按键事件
      strengthEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          strengthEl.blur();
        }
      });

      // Right arrow
      const rightArrow = createArrowButton("right", () => {
        // Increase strength
        const lorasData = parseLoraValue(widget.value);
        const loraIndex = lorasData.findIndex(l => l.name === name);
        
        if (loraIndex >= 0) {
          lorasData[loraIndex].strength = (parseFloat(lorasData[loraIndex].strength) + 0.05).toFixed(2);
          
          const newValue = formatLoraValue(lorasData);
          widget.value = newValue;
        }
      });

      strengthControl.appendChild(leftArrow);
      strengthControl.appendChild(strengthEl);
      strengthControl.appendChild(rightArrow);

      // Assemble entry
      const leftSection = document.createElement("div");
      Object.assign(leftSection.style, {
        display: "flex",
        alignItems: "center",
        flex: "1",
        minWidth: "0", // Allow shrinking
      });
      
      leftSection.appendChild(toggle);
      leftSection.appendChild(nameEl);
      
      loraEl.appendChild(leftSection);
      loraEl.appendChild(strengthControl);

      container.appendChild(loraEl);
    });
  };

  // Store the value in a variable to avoid recursion
  let widgetValue = defaultValue;

  // Create widget with initial properties
  const widget = node.addDOMWidget(name, "loras", container, {
    getValue: function() {
      return widgetValue;
    },
    setValue: function(v) {
      widgetValue = v || "";
      renderLoras(widgetValue, widget);
    },
    getHeight: function() {
      // Calculate height based on content
      const lorasCount = parseLoraValue(widgetValue).length;
      return Math.max(
        100,
        lorasCount > 0 ? 60 + lorasCount * 44 : 60 // Header + entries or minimum height
      );
    },
  });

  widget.value = defaultValue;

  widget.callback = callback;

  widget.serializeValue = () => {
    // Add dummy items to avoid the 2-element serialization issue, a bug in comfyui
    return [...widgetValue, 
        { name: "__dummy_item1__", strength: 0, active: false, _isDummy: true },
        { name: "__dummy_item2__", strength: 0, active: false, _isDummy: true }
      ];
  }

  widget.onRemove = () => {
    container.remove(); 
    previewTooltip.cleanup();
  };

  return { minWidth: 400, minHeight: 200, widget };
}
