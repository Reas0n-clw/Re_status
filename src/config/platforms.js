/**
 * 平台配置
 * 控制活动状态卡片中各个平台的开关状态和API配置
 * 
 * 注意: 实际配置值在项目根目录的 config/platforms.json 文件中
 * 后端会读取该文件，前端使用此文件作为默认配置和类型定义
 */

// 默认配置（用于前端类型定义和默认值）
export const PLATFORM_CONFIG = {
  steam: {
    enabled: true, // 是否启用该平台（默认开启）
    api: {
      // Steam ID (必需，配置在 config/platforms.json 文件中)
      // 推荐使用 SteamID64 格式（17位数字）
      // 例如: 76561198012345678
      // 也支持 SteamID32 格式: STEAM_0:0:12345678
      // 获取方式: https://steamid.io/ 或从Steam客户端查看
      steamId64: '',
      // Steam Web API 密钥 (可选)
      // 如果配置了API密钥，可以获取更完整的数据（如游戏列表、等级等）
      // 获取方式: https://steamcommunity.com/dev/apikey
      // 注意: 不配置API密钥也可以获取基本状态信息
      apiKey: ''
    }
  },
  bilibili: {
    enabled: true, // 是否启用该平台（默认开启）
    api: {
      // Bilibili API 配置
      // 如果需要API密钥，在此处配置
      apiKey: '',
      // Bilibili 用户ID (UID)
      uid: ''
    }
  },
  github: {
    enabled: true, // 是否启用该平台（默认开启）
    api: {
      // GitHub Personal Access Token
      // 获取方式: https://github.com/settings/tokens
      token: '',
      // GitHub 用户名
      username: ''
    }
  },
  discord: {
    enabled: true, // 是否启用该平台（默认开启）
    api: {
      // Discord Bot Token 或 OAuth Token
      // 获取方式: https://discord.com/developers/applications
      token: '',
      // Discord 用户ID
      userId: ''
    }
  },
  spotify: {
    enabled: true, // 是否启用该平台（默认开启）
    api: {
      // Spotify Client ID
      clientId: '',
      // Spotify Client Secret
      clientSecret: '',
      // Spotify 用户ID
      userId: ''
    }
  }
};

/**
 * 获取启用的平台列表
 * @returns {string[]} 启用的平台ID数组
 */
export const getEnabledPlatforms = () => {
  return Object.keys(PLATFORM_CONFIG).filter(
    platformId => PLATFORM_CONFIG[platformId].enabled
  );
};

/**
 * 检查平台是否启用
 * @param {string} platformId - 平台ID
 * @returns {boolean} 是否启用
 */
export const isPlatformEnabled = (platformId) => {
  return PLATFORM_CONFIG[platformId]?.enabled === true;
};

/**
 * 获取平台的API配置
 * @param {string} platformId - 平台ID
 * @returns {object} API配置对象
 */
export const getPlatformApiConfig = (platformId) => {
  return PLATFORM_CONFIG[platformId]?.api || {};
};

