import axios from 'axios';
import { LRUCache } from 'lru-cache';
import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 和风天气服务
 * 提供站长天气和访客天气查询功能，使用LRU缓存控制API请求次数
 */
class QWeatherService {
  constructor(platformConfig = null) {
    // 优先从环境变量读取配置，如果没有则从platformConfig读取
    // 配置优先级：环境变量 > platforms.json
    this.apiKey = process.env.QWEATHER_KEY || 
                  platformConfig?.weather?.api?.qweather?.apiKey || 
                  null;
    
    // Location ID优先从环境变量读取，如果没有则从platformConfig读取
    this.ownerLocationId = process.env.OWNER_LOCATION_ID || 
                           platformConfig?.weather?.api?.qweather?.ownerLocationId || 
                           null;
    
    // 站长城市名称，优先从环境变量读取，如果没有则从platformConfig读取
    // 配置优先级：环境变量 > platforms.json
    const envCityName = process.env.OWNER_LOCATION_NAME;
    const configCityName = platformConfig?.weather?.api?.qweather?.city;
    this.ownerLocationName = (envCityName && envCityName.trim()) || 
                             (configCityName && configCityName.trim()) || 
                             null;
    
    // 如果配置了city但没有Location ID，记录警告
    if (!this.ownerLocationId && platformConfig?.weather?.api?.qweather?.city) {
      console.warn('[和风天气] 已配置城市但未配置ownerLocationId，请设置ownerLocationId或环境变量OWNER_LOCATION_ID');
    }

    // 站长天气缓存：30分钟TTL
    this.ownerCache = new LRUCache({
      max: 1,
      ttl: 30 * 60 * 1000, // 30分钟
      updateAgeOnGet: false
    });

    // 访客天气缓存：60分钟TTL，最多缓存100个IP
    this.visitorCache = new LRUCache({
      max: 100,
      ttl: 60 * 60 * 1000, // 60分钟
      updateAgeOnGet: false
    });

    // IP到Location ID的映射缓存：24小时TTL
    this.ipLocationCache = new LRUCache({
      max: 500,
      ttl: 24 * 60 * 60 * 1000, // 24小时
      updateAgeOnGet: false
    });

    // 检查配置
    if (!this.apiKey) {
      console.warn('[和风天气] 警告: QWEATHER_KEY 未配置');
    }
    if (!this.ownerLocationId) {
      console.warn('[和风天气] 警告: OWNER_LOCATION_ID 未配置');
    }
  }

  /**
   * 获取请求的真实IP地址
   * 优先使用前置代理传递的真实IP，支持 Cloudflare/反代常见头
   */
  getClientIp(req) {
    const headers = req.headers || {};

    // 常见真实IP头（按优先级）
    const candidates = [
      headers['cf-connecting-ip'],
      headers['true-client-ip'],
      headers['x-real-ip'],
      // x-forwarded-for 可能有多个，用逗号分隔
      headers['x-forwarded-for']?.split(',').map(ip => ip.trim()).find(Boolean),
      req.connection?.remoteAddress,
      req.socket?.remoteAddress,
      req.ip
    ].filter(Boolean);

    // 选第一个非空
    const rawIp = candidates.find(Boolean) || '127.0.0.1';

    // 去掉端口（例如 "1.2.3.4:12345"）
    const ipWithoutPort = rawIp.split(':').length > 2
      ? rawIp // IPv6 保持原样
      : rawIp.split(':')[0];

    return ipWithoutPort;
  }

  /**
   * 判断是否为私有/本地IP
   */
  isPrivateIp(ip) {
    if (!ip) return true;

    // 处理 IPv4 兼容的 IPv6 表达形式 ::ffff:x.x.x.x
    const normalizedIp = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

    // IPv6 本地/链路本地/ULA
    if (normalizedIp === '::1' || normalizedIp === '0:0:0:0:0:0:0:1') return true;
    if (normalizedIp.startsWith('fe80:')) return true; // 链路本地
    if (normalizedIp.startsWith('fc') || normalizedIp.startsWith('fd')) return true; // ULA

    // IPv4 私有网段
    if (normalizedIp.startsWith('127.')) return true;          // 环回
    if (normalizedIp.startsWith('10.')) return true;           // A类私网
    if (normalizedIp.startsWith('192.168.')) return true;      // C类私网
    if (normalizedIp.startsWith('169.254.')) return true;      // 链路本地

    // 只屏蔽 172.16.0.0 - 172.31.255.255，避免误伤 Cloudflare 等公网 172.* 段
    const match172 = normalizedIp.match(/^172\.(\d+)\./);
    if (match172) {
      const secondOctet = Number(match172[1]);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }

    return false;
  }

  /**
   * 统一生成城市展示名（优先市级）
   */
  formatCityName(location) {
    // location.name 可能是区县，优先用 adm2(地市) 其次 adm1(省)，最后 name
    return location?.adm2 || location?.adm1 || location?.name || location?.country || '未知';
  }

  /**
   * 通过IP获取Location ID和城市信息
   */
  async getLocationByIp(ip) {
    // 跳过本地/私网IP
    if (this.isPrivateIp(ip)) {
      console.warn(`[和风天气] 跳过本地/私网IP: ${ip}`);
      return null;
    }

    // 检查缓存
    const cacheKey = `ip_${ip}`;
    const cached = this.ipLocationCache.get(cacheKey);
    if (cached) {
      console.log(`[和风天气] IP定位缓存命中: ${ip}`);
      return cached;
    }

    try {
      const response = await axios.get('https://geoapi.qweather.com/v2/city/lookup', {
        params: {
          location: ip,
          key: this.apiKey
        },
        timeout: 10000
      });

      const data = response.data;

      if (data.code === '200' && data.location && data.location.length > 0) {
        const location = data.location[0];
        const result = {
          locationId: location.id,
          city: this.formatCityName(location),
          adm1: location.adm1, // 省份
          adm2: location.adm2, // 城市
          country: location.country
        };

        // 缓存结果
        this.ipLocationCache.set(cacheKey, result);
        console.log(`[和风天气] IP定位成功: ${ip} -> ${result.city} (${result.locationId})`);
        return result;
      } else {
        console.warn(`[和风天气] IP定位失败: ${ip}, code: ${data.code}, message: ${data.message || '未知错误'}`);
      }
    } catch (error) {
      // 详细的错误处理
      if (error.response) {
        const statusCode = error.response.status;
        const errorData = error.response.data;
        
        if (statusCode === 403) {
          const apiCode = errorData?.code;
          const errorType = errorData?.error?.type || errorData?.type;
          const errorDetail = errorData?.error?.detail || errorData?.detail;
          const apiMessage = errorData?.message || errorData?.msg || errorDetail || '未知错误';
          
          let errorMsg = `[和风天气] IP定位请求失败 (403): IP=${ip}`;
          if (apiCode) {
            errorMsg += `, API Code=${apiCode}`;
          }
          if (errorType) {
            errorMsg += `, Type=${errorType}`;
          }
          errorMsg += `, Message=${apiMessage}`;
          
          if (errorType && errorType.includes('invalid-host')) {
            errorMsg += '\n  错误类型：请求主机未授权 (Invalid Host)';
            errorMsg += '\n  解决方案：请在和风天气控制台的"API配置"中添加当前服务器IP或域名到白名单';
          } else {
            errorMsg += '\n  可能原因：API Key无效、权限不足或超出请求限制';
          }
          
          console.error(errorMsg);
        } else {
          console.error(`[和风天气] IP定位请求失败 (${statusCode}): IP=${ip}, message=${errorData?.message || error.message}`);
        }
      } else {
        console.error(`[和风天气] IP定位请求失败: IP=${ip}, message=${error.message}`);
      }
      // 尝试备用IP定位服务（支持IPv6）
      const fallback = await this.getLocationByIpFallback(ip);
      if (fallback) {
        // 使用经纬度调用和风天气的城市反查
        const locationStr = `${fallback.lon},${fallback.lat}`;
        try {
          const fallbackResp = await axios.get('https://geoapi.qweather.com/v2/city/lookup', {
            params: { location: locationStr, key: this.apiKey },
            timeout: 10000
          });
          const data = fallbackResp.data;
          if (data.code === '200' && data.location && data.location.length > 0) {
            const location = data.location[0];
        const result = {
              locationId: location.id,
          city: this.formatCityName(location),
              adm1: location.adm1,
              adm2: location.adm2,
              country: location.country
            };
            this.ipLocationCache.set(cacheKey, result);
            console.log(`[和风天气] 备用IP定位成功: ${ip} -> ${result.city} (${result.locationId})`);
            return result;
          }
          console.warn(`[和风天气] 备用IP定位失败: ${ip}, code: ${data.code}, message: ${data.message || '未知错误'}`);
        } catch (fallbackErr) {
          console.error(`[和风天气] 备用IP定位调用失败: ${ip}, message=${fallbackErr.message}`);
        }
      }
      return null;
    }
  }

  /**
   * 通过经纬度获取Location ID和城市信息
   * @param {number} lat - 纬度
   * @param {number} lon - 经度
   * @returns {Promise<{locationId: string, city: string, adm1: string, adm2: string, country: string}|null>}
   */
  async getLocationByCoordinates(lat, lon) {
    if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
      console.warn(`[和风天气] 无效的经纬度: lat=${lat}, lon=${lon}`);
      return null;
    }

    // 检查缓存（使用经纬度作为缓存键，精度到小数点后2位）
    const cacheKey = `coord_${lat.toFixed(2)}_${lon.toFixed(2)}`;
    const cached = this.ipLocationCache.get(cacheKey);
    if (cached) {
      console.log(`[和风天气] 经纬度定位缓存命中: ${lat}, ${lon}`);
      return cached;
    }

    try {
      const locationStr = `${lon},${lat}`;
      const response = await axios.get('https://geoapi.qweather.com/v2/city/lookup', {
        params: {
          location: locationStr,
          key: this.apiKey
        },
        timeout: 10000
      });

      const data = response.data;

      if (data.code === '200' && data.location && data.location.length > 0) {
        const location = data.location[0];
        const result = {
          locationId: location.id,
          city: this.formatCityName(location),
          adm1: location.adm1, // 省份
          adm2: location.adm2, // 城市
          country: location.country
        };

        // 缓存结果
        this.ipLocationCache.set(cacheKey, result);
        console.log(`[和风天气] 经纬度定位成功: ${lat}, ${lon} -> ${result.city} (${result.locationId})`);
        return result;
      } else {
        console.warn(`[和风天气] 经纬度定位失败: ${lat}, ${lon}, code: ${data.code}, message: ${data.message || '未知错误'}`);
      }
    } catch (error) {
      // 详细的错误处理
      if (error.response) {
        const statusCode = error.response.status;
        const errorData = error.response.data;
        
        if (statusCode === 403) {
          const apiCode = errorData?.code;
          const errorType = errorData?.error?.type || errorData?.type;
          const errorDetail = errorData?.error?.detail || errorData?.detail;
          const apiMessage = errorData?.message || errorData?.msg || errorDetail || '未知错误';
          
          let errorMsg = `[和风天气] 经纬度定位请求失败 (403): lat=${lat}, lon=${lon}`;
          if (apiCode) {
            errorMsg += `, API Code=${apiCode}`;
          }
          if (errorType) {
            errorMsg += `, Type=${errorType}`;
          }
          errorMsg += `, Message=${apiMessage}`;
          
          if (errorType && errorType.includes('invalid-host')) {
            errorMsg += '\n  错误类型：请求主机未授权 (Invalid Host)';
            errorMsg += '\n  解决方案：请在和风天气控制台的"API配置"中添加当前服务器IP或域名到白名单';
          } else {
            errorMsg += '\n  可能原因：API Key无效、权限不足或超出请求限制';
          }
          
          console.error(errorMsg);
        } else {
          console.error(`[和风天气] 经纬度定位请求失败 (${statusCode}): lat=${lat}, lon=${lon}, message=${errorData?.message || error.message}`);
        }
      } else {
        console.error(`[和风天气] 经纬度定位请求失败: lat=${lat}, lon=${lon}, message=${error.message}`);
      }
      return null;
    }
  }

  /**
   * 备用IP定位（使用 ip.sb，支持IPv6）
   */
  async getLocationByIpFallback(ip) {
    try {
      const resp = await axios.get(`https://api.ip.sb/geoip/${encodeURIComponent(ip)}`, {
        timeout: 8000
      });
      const g = resp.data;
      if (g && g.longitude && g.latitude) {
        return {
          lat: g.latitude,
          lon: g.longitude,
          city: g.city || g.region || g.country,
          country: g.country
        };
      }
    } catch (e) {
      console.warn(`[和风天气] ip.sb 备用定位失败: ${ip}, message=${e.message}`);
    }
    return null;
  }

  /**
   * 获取天气数据
   */
  async getWeatherByLocationId(locationId) {
    try {
      const response = await axios.get('https://devapi.qweather.com/v7/weather/now', {
        params: {
          location: locationId,
          key: this.apiKey
        },
        timeout: 10000
      });

      const data = response.data;

      if (data.code === '200' && data.now) {
        const now = data.now;
        return {
          temp: parseInt(now.temp),
          condition: now.text,
          conditionZh: now.text,
          humidity: `${now.humidity}%`,
          wind: `${now.windScale}级`,
          feelsLike: parseInt(now.feelsLike),
          pressure: now.pressure,
          vis: now.vis,
          cloud: now.cloud,
          updateTime: now.obsTime
        };
      } else {
        console.warn(`[和风天气] 获取天气失败: locationId=${locationId}, code=${data.code}, message=${data.message || '未知错误'}`);
        return null;
      }
    } catch (error) {
      // 详细的错误处理
      if (error.response) {
        const statusCode = error.response.status;
        const errorData = error.response.data;
        
        if (statusCode === 403) {
          // 403错误：可能是API Key无效、权限不足、请求主机未授权或超出限制
          const apiCode = errorData?.code;
          const errorType = errorData?.error?.type || errorData?.type;
          const errorTitle = errorData?.error?.title || errorData?.title;
          const errorDetail = errorData?.error?.detail || errorData?.detail;
          const apiMessage = errorData?.message || errorData?.msg || errorDetail || '未知错误';
          
          let errorMsg = `[和风天气] 天气请求失败 (403): locationId=${locationId}`;
          if (apiCode) {
            errorMsg += `, API Code=${apiCode}`;
          }
          if (errorType) {
            errorMsg += `, Type=${errorType}`;
          }
          errorMsg += `, Message=${apiMessage}`;
          
          // 根据错误类型提供具体建议
          if (errorType && errorType.includes('invalid-host')) {
            errorMsg += '\n  错误类型：请求主机未授权 (Invalid Host)';
            errorMsg += '\n  可能原因：当前请求的IP地址或域名未在和风天气控制台授权';
            errorMsg += '\n  解决方案：';
            errorMsg += '\n  1. 登录和风天气控制台：https://dev.qweather.com/';
            errorMsg += '\n  2. 进入"API配置"或"应用管理"';
            errorMsg += '\n  3. 找到"请求主机"或"Host白名单"设置';
            errorMsg += '\n  4. 添加当前服务器IP或域名到白名单';
            errorMsg += '\n  5. 本地开发环境可添加 127.0.0.1 或 localhost';
          } else if (apiCode === '401' || apiCode === '403') {
            errorMsg += '\n  可能原因：API Key无效、已过期或权限不足';
            errorMsg += '\n  解决方案：请检查QWEATHER_KEY是否正确，并在和风天气控制台确认API Key状态';
          } else if (apiCode === '204') {
            errorMsg += '\n  可能原因：Location ID无效或不存在';
            errorMsg += '\n  解决方案：请检查OWNER_LOCATION_ID是否正确';
          } else {
            errorMsg += '\n  可能原因：';
            errorMsg += '\n  1. API Key无效或已过期';
            errorMsg += '\n  2. 请求主机未在和风天气控制台授权（最常见）';
            errorMsg += '\n  3. 超出每日/每月请求限制';
            errorMsg += '\n  4. 账户余额不足';
            errorMsg += '\n  解决方案：请登录和风天气控制台检查API Key状态、授权设置和账户余额';
          }
          
          console.error(errorMsg);
        } else if (statusCode === 401) {
          console.error(`[和风天气] 天气请求失败 (401): API Key无效或已过期, locationId=${locationId}`);
        } else {
          console.error(`[和风天气] 天气请求失败 (${statusCode}): locationId=${locationId}, message=${errorData?.message || error.message}`);
        }
      } else if (error.request) {
        console.error(`[和风天气] 天气请求失败: 网络错误, locationId=${locationId}, message=${error.message}`);
      } else {
        console.error(`[和风天气] 天气请求失败: locationId=${locationId}, message=${error.message}`);
      }
      return null;
    }
  }

  /**
   * 获取站长天气
   * 使用固定Location ID，缓存30分钟
   */
  async getOwnerWeather() {
    if (!this.apiKey || !this.ownerLocationId) {
      console.warn('[和风天气] 站长天气: API Key 或 Location ID 未配置');
      return null;
    }

    // 检查缓存
    const cacheKey = 'owner_weather';
    const cached = this.ownerCache.get(cacheKey);
    if (cached) {
      console.log('[和风天气] 站长天气缓存命中');
      // 确保缓存的数据也包含城市名（兼容旧缓存）
      if (this.ownerLocationName && !cached.city) {
        cached.city = this.ownerLocationName;
      }
      return cached;
    }

    console.log(`[和风天气] 获取站长天气: Location ID = ${this.ownerLocationId}`);
    const weather = await this.getWeatherByLocationId(this.ownerLocationId);

    if (weather) {
      // 添加位置信息
      weather.locationId = this.ownerLocationId;
      // 从环境变量读取城市名，直接设置，不需要调用 city/lookup 接口
      if (this.ownerLocationName) {
        weather.city = this.ownerLocationName;
      }
      // 缓存结果
      this.ownerCache.set(cacheKey, weather);
      console.log(`[和风天气] 站长天气获取成功: ${weather.city || '未知'} ${weather.temp}°C ${weather.conditionZh}`);
    }

    return weather;
  }

  /**
   * 获取访客天气
   * 优先使用经纬度定位，失败则回退到IP定位，缓存60分钟
   * @param {object} req - Express请求对象
   * @param {number} [lat] - 纬度（可选）
   * @param {number} [lon] - 经度（可选）
   */
  async getVisitorWeather(req, lat = null, lon = null) {
    if (!this.apiKey) {
      console.warn('[和风天气] 访客天气: API Key 未配置');
      return null;
    }

    const ip = this.getClientIp(req);
    // 缓存键：如果有经纬度，使用经纬度；否则使用IP
    const cacheKey = lat && lon 
      ? `visitor_${lat.toFixed(2)}_${lon.toFixed(2)}`
      : `visitor_${ip}`;

    // 检查缓存
    const cached = this.visitorCache.get(cacheKey);
    if (cached) {
      console.log(`[和风天气] 访客天气缓存命中: ${lat && lon ? `${lat}, ${lon}` : ip}`);
      return cached;
    }

    let location = null;

    // 优先使用经纬度定位
    if (lat && lon) {
      console.log(`[和风天气] 获取访客天气: 使用经纬度定位 lat=${lat}, lon=${lon}`);
      location = await this.getLocationByCoordinates(lat, lon);
      
      if (!location) {
        console.warn(`[和风天气] 经纬度定位失败，回退到IP定位: lat=${lat}, lon=${lon}`);
        // 回退到IP定位
        location = await this.getLocationByIp(ip);
      }
    } else {
      // 使用IP定位
      console.log(`[和风天气] 获取访客天气: 使用IP定位 IP = ${ip}`);
      location = await this.getLocationByIp(ip);
    }

    if (!location) {
      console.warn(`[和风天气] 访客定位失败: ${lat && lon ? `经纬度 ${lat}, ${lon}` : `IP ${ip}`}`);
      return null;
    }

    // 获取天气数据
    const weather = await this.getWeatherByLocationId(location.locationId);
    if (!weather) {
      console.warn(`[和风天气] 访客天气获取失败: ${lat && lon ? `经纬度 ${lat}, ${lon}` : `IP ${ip}`}`);
      return null;
    }

    // 添加位置信息
    weather.locationId = location.locationId;
    weather.city = location.city;
    weather.adm1 = location.adm1;
    weather.adm2 = location.adm2;
    weather.country = location.country;

    // 缓存结果
    this.visitorCache.set(cacheKey, weather);
    const locationSource = lat && lon ? `经纬度 ${lat}, ${lon}` : `IP ${ip}`;
    console.log(`[和风天气] 访客天气获取成功: ${locationSource} -> ${weather.city} ${weather.temp}°C ${weather.conditionZh}`);

    return weather;
  }

  /**
   * 获取完整的天气数据（站长 + 访客）
   * @param {object} req - Express请求对象
   * @param {number} [lat] - 纬度（可选）
   * @param {number} [lon] - 经度（可选）
   */
  async getWeatherData(req, lat = null, lon = null) {
    const [owner, visitor] = await Promise.all([
      this.getOwnerWeather(),
      this.getVisitorWeather(req, lat, lon)
    ]);

    return {
      owner: owner || null,
      visitor: visitor || null
    };
  }

  /**
   * 清除所有缓存
   */
  clearCache() {
    this.ownerCache.clear();
    this.visitorCache.clear();
    this.ipLocationCache.clear();
    console.log('[和风天气] 所有缓存已清除');
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats() {
    return {
      owner: {
        size: this.ownerCache.size,
        max: this.ownerCache.max
      },
      visitor: {
        size: this.visitorCache.size,
        max: this.visitorCache.max
      },
      ipLocation: {
        size: this.ipLocationCache.size,
        max: this.ipLocationCache.max
      }
    };
  }
}

// 导出类，让server.js创建实例
export default QWeatherService;

