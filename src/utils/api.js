/**
 * API 工具函数
 * 自动检测 API 基础 URL，支持多种场景：
 * 1. 开发环境：使用环境变量或 localhost
 * 2. 生产环境：自动使用当前访问的域名/IP
 */

/**
 * 获取 API 基础 URL
 * 优先级：
 * 1. 环境变量 VITE_API_BASE_URL
 * 2. 当前访问的 origin（自动适配）
 * 3. 默认 localhost:3000（仅开发环境）
 */
export function getApiBaseUrl() {
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');

  if (typeof window !== 'undefined') {
    const isHttps = window.location.protocol === 'https:';

    // 若环境变量指定 http 而页面是 https，返回相对路径避免浏览器混合内容阻断
    if (envBaseUrl) {
      const envIsHttp = envBaseUrl.startsWith('http://');
      if (isHttps && envIsHttp) {
        return '';
      }
      return envBaseUrl;
    }

    const origin = window.location.origin;
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return 'http://localhost:3000';
    }
    return origin;
  }

  // 默认值（SSR 或非浏览器环境）
  return envBaseUrl || 'http://localhost:3000';
}

/**
 * 获取 WebSocket URL
 */
export function getWebSocketUrl() {
  const apiBaseUrl = getApiBaseUrl();
  // 将 http/https 替换为 ws/wss
  return apiBaseUrl.replace(/^http/, 'ws') + '/ws';
}

