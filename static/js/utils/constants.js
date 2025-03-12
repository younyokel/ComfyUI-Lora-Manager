export const BASE_MODELS = {
    // Stable Diffusion 1.x models
    SD_1_4: "SD 1.4",
    SD_1_5: "SD 1.5",
    SD_1_5_LCM: "SD 1.5 LCM",
    SD_1_5_HYPER: "SD 1.5 Hyper",
    
    // Stable Diffusion 2.x models
    SD_2_0: "SD 2.0",
    SD_2_1: "SD 2.1",
    
    // Stable Diffusion 3.x models
    SD_3: "SD 3",
    SD_3_5: "SD 3.5",
    SD_3_5_MEDIUM: "SD 3.5 Medium",
    SD_3_5_LARGE: "SD 3.5 Large",
    SD_3_5_LARGE_TURBO: "SD 3.5 Large Turbo",
    
    // SDXL models
    SDXL: "SDXL 1.0",
    SDXL_LIGHTNING: "SDXL Lightning",
    SDXL_HYPER: "SDXL Hyper",

    // Other models
    FLUX_1_D: "Flux.1 D",
    FLUX_1_S: "Flux.1 S",
    AURAFLOW: "AuraFlow",
    PIXART_A: "PixArt a",
    PIXART_E: "PixArt E",
    HUNYUAN_1: "Hunyuan 1",
    LUMINA: "Lumina",
    KOLORS: "Kolors",
    NOOBAI: "NoobAI",
    IL: "IL",
    PONY: "Pony",
    
    // Video models
    SVD: "SVD",
    WAN_VIDEO: "Wan Video",
    HUNYUAN_VIDEO: "Hunyuan Video",
    
    // Default
    UNKNOWN: "Unknown"
};

// Base model display names and their corresponding class names (for styling)
export const BASE_MODEL_CLASSES = {
    // Stable Diffusion 1.x models
    [BASE_MODELS.SD_1_4]: "sd-1-4",
    [BASE_MODELS.SD_1_5]: "sd-1-5",
    [BASE_MODELS.SD_1_5_LCM]: "sd-1-5-lcm",
    [BASE_MODELS.SD_1_5_HYPER]: "sd-1-5-hyper",
    
    // Stable Diffusion 2.x models
    [BASE_MODELS.SD_2_0]: "sd-2-0",
    [BASE_MODELS.SD_2_1]: "sd-2-1",
    
    // Stable Diffusion 3.x models
    [BASE_MODELS.SD_3]: "sd-3",
    [BASE_MODELS.SD_3_5]: "sd-3-5",
    [BASE_MODELS.SD_3_5_MEDIUM]: "sd-3-5-medium",
    [BASE_MODELS.SD_3_5_LARGE]: "sd-3-5-large",
    [BASE_MODELS.SD_3_5_LARGE_TURBO]: "sd-3-5-large-turbo",
    
    // SDXL models
    [BASE_MODELS.SDXL]: "sdxl",
    [BASE_MODELS.SDXL_LIGHTNING]: "sdxl-lightning",
    [BASE_MODELS.SDXL_HYPER]: "sdxl-hyper",
    
    // Video models
    [BASE_MODELS.SVD]: "svd",
    [BASE_MODELS.WAN_VIDEO]: "wan-video",
    [BASE_MODELS.HUNYUAN_VIDEO]: "hunyuan-video",
    
    // Other models
    [BASE_MODELS.FLUX_1_D]: "flux-d",
    [BASE_MODELS.FLUX_1_S]: "flux-s",
    [BASE_MODELS.AURAFLOW]: "auraflow",
    [BASE_MODELS.PIXART_A]: "pixart-a",
    [BASE_MODELS.PIXART_E]: "pixart-e",
    [BASE_MODELS.HUNYUAN_1]: "hunyuan-1",
    [BASE_MODELS.LUMINA]: "lumina",
    [BASE_MODELS.KOLORS]: "kolors",
    [BASE_MODELS.NOOBAI]: "noobai",
    [BASE_MODELS.IL]: "il",
    [BASE_MODELS.PONY]: "pony",
    
    // Default
    [BASE_MODELS.UNKNOWN]: "unknown"
};

export const NSFW_LEVELS = {
    PG: 1,
    PG13: 2,
    R: 4,
    X: 8,
    XXX: 16,
    BLOCKED: 32
};