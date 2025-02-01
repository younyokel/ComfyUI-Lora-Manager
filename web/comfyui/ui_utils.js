import { app } from "../../scripts/app.js";
const extension = {
    name: "lora-manager.widget",
};

app.registerExtension(extension);
const config = {
    newTab: true,
};

const createWidget = ({ className, text, tooltip, includeIcon, svgMarkup }) => {
    const button = document.createElement('button');
    button.className = className;
    button.setAttribute('aria-label', tooltip);
    button.title = tooltip;

    if (includeIcon && svgMarkup) {
        const iconContainer = document.createElement('span');
        iconContainer.innerHTML = svgMarkup;
        iconContainer.style.display = 'flex';
        iconContainer.style.alignItems = 'center';
        iconContainer.style.justifyContent = 'center';
        iconContainer.style.width = '40px';
        iconContainer.style.height = '16px';
        button.appendChild(iconContainer);
    }

    const textNode = document.createTextNode(text);
    button.appendChild(textNode);

    button.addEventListener('click', onClick);
    return button;
};

const onClick = () => {
    const loraManagerUrl = `${window.location.origin}/loras`;
    if (config.newTab) {
        window.open(loraManagerUrl, '_blank');
    } else {
        window.location.href = loraManagerUrl;
    }
};

const addWidgetMenuRight = (menuRight) => {
    let buttonGroup = menuRight.querySelector('.comfyui-button-group');

    if (!buttonGroup) {
        buttonGroup = document.createElement('div');
        buttonGroup.className = 'comfyui-button-group';
        menuRight.appendChild(buttonGroup);
    }

    const loraManagerButton = createWidget({
        className: 'comfyui-button comfyui-menu-mobile-collapse primary',
        text: '',
        tooltip: 'Launch Lora Manager',
        includeIcon: true,
        svgMarkup: getLoraManagerIcon(),
    });

    buttonGroup.appendChild(loraManagerButton);
};

const addWidgetMenu = (menu) => {
    const resetViewButton = menu.querySelector('#comfy-reset-view-button');
    if (!resetViewButton) {
        return;
    }

    const loraManagerButton = createWidget({
        className: 'comfy-lora-manager-button',
        text: 'Lora Manager',
        tooltip: 'Launch Lora Manager',
        includeIcon: false,
    });

    resetViewButton.insertAdjacentElement('afterend', loraManagerButton);
};

const addWidget = (selector, callback) => {
    const observer = new MutationObserver((mutations, obs) => {
        const element = document.querySelector(selector);
        if (element) {
            callback(element);
            obs.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
};

const initializeWidgets = () => {
    addWidget('.comfyui-menu-right', addWidgetMenuRight);
    addWidget('.comfy-menu', addWidgetMenu);
};

const getLoraManagerIcon = () => {
    return `
        <svg xmlns="http://www.w3.org/2000/svg" 
            width="24" 
            height="24" 
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none">
            <path d="M7 5.5h4v13H7z"/>
            <path d="M16 18.5V5.5l-5 6.5 5 6.5"/>
        </svg>
    `;
};

initializeWidgets();