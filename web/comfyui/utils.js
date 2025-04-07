export const CONVERTED_TYPE = 'converted-widget';

export function getComfyUIFrontendVersion() {
  return window['__COMFYUI_FRONTEND_VERSION__'] || "0.0.0";
}

// Dynamically import the appropriate widget based on app version
export async function dynamicImportByVersion(latestModulePath, legacyModulePath) {
  // Parse app version and compare with 1.12.6 (version when tags widget API changed)
  const currentVersion = getComfyUIFrontendVersion();
  const versionParts = currentVersion.split('.').map(part => parseInt(part, 10));
  const requiredVersion = [1, 12, 6];
  
  // Compare version numbers
  for (let i = 0; i < 3; i++) {
    if (versionParts[i] > requiredVersion[i]) {
      console.log(`Using latest widget: ${latestModulePath}`);
      return import(latestModulePath);
    } else if (versionParts[i] < requiredVersion[i]) {
      console.log(`Using legacy widget: ${legacyModulePath}`);
      return import(legacyModulePath);
    }
  }
  
  // If we get here, versions are equal, use the latest module
  console.log(`Using latest widget: ${latestModulePath}`);
  return import(latestModulePath);
}

export function hideWidgetForGood(node, widget, suffix = "") {
  widget.origType = widget.type;
  widget.origComputeSize = widget.computeSize;
  widget.origSerializeValue = widget.serializeValue;
  widget.computeSize = () => [0, -4]; // -4 is due to the gap litegraph adds between widgets automatically
  widget.type = CONVERTED_TYPE + suffix;
  // widget.serializeValue = () => {
  //     // Prevent serializing the widget if we have no input linked
  //     const w = node.inputs?.find((i) => i.widget?.name === widget.name);
  //     if (w?.link == null) {
  //         return undefined;
  //     }
  //     return widget.origSerializeValue ? widget.origSerializeValue() : widget.value;
  // };

  // Hide any linked widgets, e.g. seed+seedControl
  if (widget.linkedWidgets) {
    for (const w of widget.linkedWidgets) {
      hideWidgetForGood(node, w, `:${widget.name}`);
    }
  }
}

// Wrapper class to handle 'two element array bug' in LiteGraph or comfyui
export class DataWrapper {
  constructor(data) {
    this.data = data;
  }

  getData() {
    return this.data;
  }

  setData(data) {
    this.data = data;
  }
}