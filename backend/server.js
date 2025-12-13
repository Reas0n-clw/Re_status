import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import axios from 'axios';
import multer from 'multer';
import QWeatherService from './qweatherService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量（固定指向 backend/.env，避免工作目录差异）
dotenv.config({ path: join(__dirname, '.env') });

// 加载平台配置文件（卡片相关配置）
let PLATFORM_CONFIG = {};
const platformConfigPath = join(__dirname, '..', 'config', 'platforms.json');
try {
  if (existsSync(platformConfigPath)) {
    PLATFORM_CONFIG = JSON.parse(readFileSync(platformConfigPath, 'utf-8'));
  } else {
    console.warn('[配置] 平台配置文件不存在，使用默认配置');
  }
} catch (error) {
  console.error('[配置] 加载平台配置文件失败:', error.message);
}

// 加载网站配置文件（网页相关配置）
let SITE_CONFIG = {};
const siteConfigPath = join(__dirname, '..', 'config', 'site.json');
try {
  if (existsSync(siteConfigPath)) {
    SITE_CONFIG = JSON.parse(readFileSync(siteConfigPath, 'utf-8'));
  } else {
    console.warn('[配置] 网站配置文件不存在，使用默认配置');
  }
} catch (error) {
  console.error('[配置] 加载网站配置文件失败:', error.message);
}

// 创建和风天气服务实例，传入平台配置
const qweatherService = new QWeatherService(PLATFORM_CONFIG);

// Steam 配置（ID 从配置读取，密钥优先环境变量）
// 支持 SteamID64（推荐）或 SteamID32 格式
const STEAM_ID = process.env.STEAM_ID64 || process.env.STEAM_ID || PLATFORM_CONFIG?.steam?.api?.steamId64 || PLATFORM_CONFIG?.steam?.api?.steamId32 || null;
const STEAM_API_KEY = process.env.STEAM_API_KEY || PLATFORM_CONFIG?.steam?.api?.apiKey || null;
const STEAM_POLL_INTERVAL = 60 * 1000; // 后端轮询间隔：1分钟

// Steam 状态缓存（由后端定时刷新）
let steamCache = {
  result: null,
  lastUpdated: null,
  lastError: null
};
let steamPollingTimer = null;

// API 密钥配置（强制要求）
const API_KEY = process.env.API_KEY || null;
const REQUIRE_API_KEY = process.env.REQUIRE_API_KEY !== 'false'; // 默认 true，除非明确设置为 false

// 如果未配置密钥，启动时警告
if (!API_KEY) {
  console.warn('⚠️  警告: 未配置 API_KEY，所有设备上报请求将被拒绝！');
  console.warn('   请在 .env 文件中配置 API_KEY');
}

// Bilibili 配置（密钥优先环境变量）
const BILIBILI_UID = process.env.BILIBILI_UID || PLATFORM_CONFIG?.bilibili?.api?.uid || null;
const BILIBILI_SESSDATA = process.env.BILIBILI_SESSDATA || PLATFORM_CONFIG?.bilibili?.api?.sessdata || '';

// 启动时打印Bilibili配置状态
if (BILIBILI_UID) {
  if (!BILIBILI_SESSDATA) {
    console.warn('[配置] Bilibili SESSDATA 未配置，可能遇到访问限制');
  }
} else {
  console.warn('[配置] Bilibili UID 未配置');
}

// 天气配置（密钥优先环境变量）
const WEATHER_ENABLED = PLATFORM_CONFIG?.weather?.enabled !== false;
const WEATHER_QW_API_KEY = process.env.QWEATHER_KEY || PLATFORM_CONFIG?.weather?.api?.qweather?.apiKey || null;
const WEATHER_QW_CITY = process.env.QWEATHER_CITY || PLATFORM_CONFIG?.weather?.api?.qweather?.city || null;

// 启动时打印天气配置状态
if (WEATHER_ENABLED) {
    const qweatherApiKey = process.env.QWEATHER_KEY || WEATHER_QW_API_KEY;
    const ownerLocationId = process.env.OWNER_LOCATION_ID || PLATFORM_CONFIG?.weather?.api?.qweather?.ownerLocationId;
    
    if (qweatherApiKey && !ownerLocationId) {
      console.warn('[配置] 天气服务: 和风天气 API Key 已配置，但未配置 ownerLocationId，站长天气功能不可用');
    } else if (!qweatherApiKey) {
      console.warn('[配置] 天气服务: 和风天气已启用但未配置API密钥');
  }
}

// 天气数据缓存
const weatherCache = {
  data: null,
  timestamp: 0
};
const WEATHER_CACHE_DURATION = 30 * 60 * 1000; // 30分钟

// Bilibili 数据缓存
const bilibiliCache = {
  userInfo: { data: null, timestamp: 0 },
  userStats: { data: null, timestamp: 0 },
  videos: { data: null, timestamp: 0 },
  favorites: { data: null, timestamp: 0 } // 收藏夹缓存
};

const CACHE_DURATION = 30 * 60 * 1000; // 30分钟（1800秒）

// WBI Keys 缓存（缓存1天）
let wbiKeysCache = {
  imgKey: null,
  subKey: null,
  timestamp: 0
};

const WBI_KEYS_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时

// WBI Mixin Key 混淆表
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52
];

// 固定 User-Agent（确保所有 Bilibili API 请求使用同一个 UA，避免签名校验失败）
const FIXED_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
console.log('[Bilibili] 固定 User-Agent:', FIXED_USER_AGENT);

/**
 * 获取固定 User-Agent（始终返回固定的 UA）
 * @returns {string} 固定 User-Agent
 */
function getRandomUserAgent() {
  return FIXED_USER_AGENT;
}

/**
 * 随机延迟函数（模拟人类行为）
 * @param {number} min - 最小延迟（毫秒）
 * @param {number} max - 最大延迟（毫秒）
 * @returns {Promise<void>}
 */
function randomDelay(min = 500, max = 2000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// 获取缓存的辅助函数（只返回未过期的缓存）
function getCachedData(cacheKey) {
  const cache = bilibiliCache[cacheKey];
  if (cache && cache.data && (Date.now() - cache.timestamp) < CACHE_DURATION) {
    return cache.data;
  }
  return null;
}

/**
 * 获取过期缓存（用于错误降级）
 * @param {string} cacheKey - 缓存键
 * @returns {object|null} 过期缓存数据或 null
 */
function getStaleCache(cacheKey) {
  const cache = bilibiliCache[cacheKey];
  if (cache && cache.data) {
    // 即使过期也返回，用于降级
    return cache.data;
  }
  return null;
}

// 设置缓存的辅助函数
function setCachedData(cacheKey, data) {
  bilibiliCache[cacheKey] = {
    data: data,
    timestamp: Date.now()
  };
}

/**
 * 获取 WBI Keys (img_key 和 sub_key)
 * @returns {Promise<{imgKey: string, subKey: string}|null>} WBI Keys 或 null
 */
async function getWbiKeys() {
  // 检查缓存
  if (wbiKeysCache.imgKey && wbiKeysCache.subKey && 
      (Date.now() - wbiKeysCache.timestamp) < WBI_KEYS_CACHE_DURATION) {
    console.log('[Bilibili WBI] 使用缓存的 WBI Keys');
    return {
      imgKey: wbiKeysCache.imgKey,
      subKey: wbiKeysCache.subKey
    };
  }
  
  try {
    // 随机延迟（模拟人类行为）
    await randomDelay(500, 2000);
    
    // 构建请求头（使用随机 User-Agent）
    const headers = {
      'User-Agent': getRandomUserAgent(),
      'Referer': 'https://www.bilibili.com/',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site'
    };
    
    // 添加 Cookie
    if (BILIBILI_SESSDATA) {
      headers['Cookie'] = `SESSDATA=${BILIBILI_SESSDATA}`;
    }
    
    const url = 'https://api.bilibili.com/x/web-interface/nav';
    const response = await axios.get(url, {
      headers: headers,
      timeout: 10000
    });
    
    // 支持多种响应结构路径
    let wbiImgData = null;
    let wbiSubData = null;
    
    // 路径1: response.data.data.wbi_img (标准路径)
    if (response.data && (response.data.code === 0 || response.data.code === -101) && response.data.data) {
      const data = response.data.data;
      wbiImgData = data.wbi_img || null;
      wbiSubData = data.wbi_sub || null;
    }
    
    // 路径2: response.data.wbi_img (如果 data 不存在，直接访问)
    if (!wbiImgData && response.data && response.data.wbi_img) {
      wbiImgData = response.data.wbi_img;
      wbiSubData = response.data.wbi_sub || null;
    }
    
    // 从 wbi_img 对象中提取 URL
    // 注意：根据日志，wbi_img 对象可能同时包含 img_url 和 sub_url
    let imgUrl = '';
    let subUrl = '';
    
    if (wbiImgData) {
      // 优先从 wbi_img 对象中获取两个 URL
      imgUrl = wbiImgData.img_url || wbiImgData.url || '';
      subUrl = wbiImgData.sub_url || '';
    }
    
    // 如果 sub_url 在 wbi_img 中找不到，尝试从 wbi_sub 中获取
    if (!subUrl && wbiSubData) {
      subUrl = wbiSubData.sub_url || wbiSubData.url || '';
    }
    
    // 提取文件名（去掉路径和扩展名）
    let imgKey = '';
    let subKey = '';
    
    if (imgUrl) {
      // 从 URL 中提取文件名，例如: https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png
      // 提取出: 7cd084941338484aae1ad9425b84077c
      const imgFileName = imgUrl.split('/').pop() || '';
      imgKey = imgFileName.split('.')[0] || '';
    }
    
    if (subUrl) {
      const subFileName = subUrl.split('/').pop() || '';
      subKey = subFileName.split('.')[0] || '';
    }
    
    if (imgKey && subKey) {
      // 缓存 keys
      wbiKeysCache = {
        imgKey: imgKey,
        subKey: subKey,
        timestamp: Date.now()
      };
      
      console.log('[Bilibili WBI] 成功获取 WBI Keys');
      console.log('[Bilibili WBI] img_key:', imgKey);
      console.log('[Bilibili WBI] sub_key:', subKey);
      console.log('[Bilibili WBI] img_url:', imgUrl);
      console.log('[Bilibili WBI] sub_url:', subUrl);
      return {
        imgKey: imgKey,
        subKey: subKey
      };
    } else {
      console.warn('[Bilibili WBI] 无法从响应中提取 WBI Keys');
      console.warn('[Bilibili WBI] imgUrl:', imgUrl);
      console.warn('[Bilibili WBI] subUrl:', subUrl);
      console.warn('[Bilibili WBI] imgKey:', imgKey);
      console.warn('[Bilibili WBI] subKey:', subKey);
      console.warn('[Bilibili WBI] 响应数据结构:', JSON.stringify({
        response_data: response.data,
        wbi_img: wbiImgData,
        wbi_sub: wbiSubData
      }, null, 2));
      return null;
    }
  } catch (error) {
    console.error('[Bilibili WBI] 获取 WBI Keys 异常:', error.message);
    if (error.response) {
      console.error('[Bilibili WBI] HTTP 状态:', error.response.status);
      console.error('[Bilibili WBI] 响应数据:', error.response.data);
    }
    // 如果有缓存的 keys，返回缓存的
    if (wbiKeysCache.imgKey && wbiKeysCache.subKey) {
      console.log('[Bilibili WBI] 使用缓存的 WBI Keys（降级）');
      return {
        imgKey: wbiKeysCache.imgKey,
        subKey: wbiKeysCache.subKey
      };
    }
    return null;
  }
}

/**
 * WBI 签名加密函数
 * @param {object} params - 查询参数对象
 * @param {string} imgKey - img_key
 * @param {string} subKey - sub_key
 * @returns {object} 包含 w_rid 和 wts 的对象
 */
function encWbi(params, imgKey, subKey) {
  // 拼接 keys
  const mixinKey = imgKey + subKey;
  
  // 使用混淆表对 mixinKey 进行字符映射（取前32个字符）
  let mixedKey = '';
  for (let i = 0; i < 32; i++) {
    const index = MIXIN_KEY_ENC_TAB[i];
    if (index < mixinKey.length) {
      mixedKey += mixinKey[index];
    }
  }
  
  // 添加时间戳（不直接修改原 params 对象）
  const wts = Math.floor(Date.now() / 1000);
  console.log('[WBI Debug] 当前签名时间戳 (wts):', wts, '本地时间:', new Date().toLocaleString());
  const paramsWithWts = { ...params, wts: wts };
  
  // 按照 key 字典序排序并拼接
  const sortedParams = Object.keys(paramsWithWts)
    .sort()
    .map(key => {
      const value = paramsWithWts[key];
      // 对值进行 URL 编码
      return `${key}=${encodeURIComponent(value)}`;
    })
    .join('&');
  
  // 拼接 query string 和 mixed key
  const queryString = sortedParams + mixedKey;
  
  // MD5 加密
  const w_rid = createHash('md5').update(queryString).digest('hex');
  
  return {
    w_rid: w_rid,
    wts: wts
  };
}

// 确保数据目录存在
const dataDir = join(__dirname, 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// 确保上传目录存在
const uploadsDir = join(__dirname, 'uploads');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

// 确保头像和背景图片子目录存在
const avatarDir = join(uploadsDir, 'avatars');
const bgImageDir = join(uploadsDir, 'bg-images');
if (!existsSync(avatarDir)) {
  mkdirSync(avatarDir, { recursive: true });
}
if (!existsSync(bgImageDir)) {
  mkdirSync(bgImageDir, { recursive: true });
}

// 持久化数据文件路径集中管理，避免初始化顺序问题
const persistentPaths = {
  usageDataFile: join(dataDir, 'usage.json'),
  statsTodayFile: join(dataDir, 'stats_today.json'),
  bilibiliDataFile: join(dataDir, 'bilibili_data.json'),
  deviceStatusFile: join(dataDir, 'device_status.json')
};

const {
  usageDataFile,
  statsTodayFile,
  bilibiliDataFile,
  deviceStatusFile
} = persistentPaths;

// 启动时重置持久化数据与缓存（仅保留配置）
function resetPersistentDataOnStartup(files = persistentPaths) {
  const filesToReset = [
    files.usageDataFile,
    files.statsTodayFile,
    files.bilibiliDataFile,
    files.deviceStatusFile
  ];

  filesToReset.forEach(file => {
    if (existsSync(file)) {
      try {
        unlinkSync(file);
        console.log(`[启动初始化] 已删除旧数据文件: ${file}`);
      } catch (err) {
        console.warn(`[启动初始化] 删除文件失败: ${file}`, err.message);
      }
    }
  });

  // 清空内存缓存（Steam/Bilibili/天气）
  steamCache = { result: null, lastUpdated: null, lastError: null };
  bilibiliCache.userInfo = { data: null, timestamp: 0 };
  bilibiliCache.userStats = { data: null, timestamp: 0 };
  bilibiliCache.videos = { data: null, timestamp: 0 };
  bilibiliCache.favorites = { data: null, timestamp: 0 };
  wbiKeysCache = { imgKey: null, subKey: null, timestamp: 0 };
  weatherCache.data = null;
  weatherCache.timestamp = 0;

  console.log('[启动初始化] 数据缓存已重置（Steam/Bilibili/天气/设备/使用数据）');
}

// 在服务启动前执行数据重置
resetPersistentDataOnStartup();

// 加载使用记录数据
function loadUsageData() {
  try {
    if (existsSync(usageDataFile)) {
      const data = JSON.parse(readFileSync(usageDataFile, 'utf-8'));
      return data.records || [];
    }
  } catch (error) {
    console.error('[数据加载失败]', error);
  }
  return [];
}

// 保存使用记录数据
function saveUsageData(records) {
  try {
    const data = {
      records: records,
      lastUpdate: new Date().toISOString()
    };
    writeFileSync(usageDataFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[数据保存失败]', error);
  }
}

// 初始化：加载已有数据
let usageRecords = loadUsageData();

/**
 * 获取今天的日期字符串（YYYY-MM-DD）
 */
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 加载今日统计数据
 */
function loadTodayStats() {
  try {
    if (existsSync(statsTodayFile)) {
      const data = JSON.parse(readFileSync(statsTodayFile, 'utf-8'));
      const today = getTodayDateString();
      
      // 检查日期，如果跨天了，重置数据
      if (data.date !== today) {
        const newData = {
          date: today,
          apps: {}
        };
        writeFileSync(statsTodayFile, JSON.stringify(newData, null, 2), 'utf-8');
        return newData;
      }
      
      return data;
    }
  } catch (error) {
    console.warn('[统计] 加载今日统计数据失败:', error.message);
  }
  
  // 如果文件不存在或加载失败，返回默认结构
  return {
    date: getTodayDateString(),
    apps: {}
  };
}

/**
 * 保存今日统计数据
 */
function saveTodayStats(data) {
  try {
    writeFileSync(statsTodayFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[统计] 保存今日统计数据失败:', error);
  }
}

/**
 * 更新今日应用使用时长统计
 * @param {string} appName - 应用名称
 * @param {number} duration - 使用时长（秒）
 */
function updateTodayStats(appName, duration) {
  if (!appName || !duration || duration <= 0) {
    return;
  }
  
  // 加载今日统计数据
  const stats = loadTodayStats();
  const today = getTodayDateString();
  
  // 如果日期变了，重置
  if (stats.date !== today) {
    stats.date = today;
    stats.apps = {};
  }
  
  // 累加时长
  stats.apps[appName] = (stats.apps[appName] || 0) + duration;
  
  // 保存
  saveTodayStats(stats);
  
}

// 数据保留配置
const DATA_RETENTION_DAYS = parseInt(process.env.DATA_RETENTION_DAYS || '7'); // 默认保留7天
const MAX_RECORDS = parseInt(process.env.MAX_RECORDS || '1000'); // 最多保留记录数

// 获取北京时间今日开始时间（UTC+8）
function getBeijingTodayStart() {
  const now = new Date();
  // 转换为北京时间（UTC+8）
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  // 获取北京时间的年月日
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const date = beijingTime.getUTCDate();
  // 创建北京时间今日0点（UTC时间）
  const beijingTodayStart = new Date(Date.UTC(year, month, date, 0, 0, 0, 0));
  // 转换回本地时间戳
  return beijingTodayStart.getTime() - 8 * 60 * 60 * 1000;
}

// 清理超过保留期的旧数据
function cleanupOldRecords() {
  const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const retentionDate = new Date(beijingNow);
  retentionDate.setUTCDate(retentionDate.getUTCDate() - DATA_RETENTION_DAYS);
  retentionDate.setUTCHours(0, 0, 0, 0);
  const retentionTimestamp = retentionDate.getTime() - 8 * 60 * 60 * 1000;
  
  const beforeCount = usageRecords.length;
  
  // 过滤：只保留保留期内的记录
  let filteredRecords = usageRecords.filter(r => {
    const recordTime = new Date(r.timestamp).getTime();
    return recordTime >= retentionTimestamp;
  });
  
  // 如果记录太多，只保留最近的记录
  if (filteredRecords.length > MAX_RECORDS) {
    filteredRecords = filteredRecords
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-MAX_RECORDS);
  }
  
  usageRecords = filteredRecords;
  saveUsageData(usageRecords);
  
  const deletedCount = beforeCount - usageRecords.length;
  if (deletedCount > 0) {
  }
  
  return deletedCount;
}

// 每日北京时间24:00自动清理旧数据
function scheduleDailyCleanup() {
  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  
  // 计算到下一个北京时间24:00的毫秒数
  const nextMidnight = new Date(Date.UTC(
    beijingTime.getUTCFullYear(),
    beijingTime.getUTCMonth(),
    beijingTime.getUTCDate() + 1, // 明天
    0, 0, 0, 0
  ));
  const beijingNextMidnight = nextMidnight.getTime() - 8 * 60 * 60 * 1000;
  const msUntilMidnight = beijingNextMidnight - now.getTime();
  
  const minutesUntilMidnight = Math.round(msUntilMidnight / 1000 / 60);
  
  setTimeout(() => {
    // 执行清理
    cleanupOldRecords();
    
    // 安排下一次清理任务
    scheduleDailyCleanup();
  }, msUntilMidnight);
}

// 启动定时任务
scheduleDailyCleanup();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // 默认监听所有网络接口

// 创建 WebSocket 服务器
const wss = new WebSocketServer({ server, path: '/ws' });

// WebSocket 连接管理
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  
  // 连接时立即发送当前状态
  broadcastDeviceStatus();
  
  ws.on('close', () => {
    clients.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('[WebSocket] 错误:', error);
  });
});

// 广播设备状态给所有连接的客户端
// 广播设备状态给所有连接的客户端
function broadcastDeviceStatus() {
  if (clients.size === 0) return;
  
  // 构建设备列表数据
  let devices = {};
  
  // 遍历缓存中的所有设备 (支持 PC 和 Mobile)
  Object.keys(deviceStatusCache).forEach(deviceId => {
    const status = deviceStatusCache[deviceId];
    const lastUpdate = status.lastUpdate ? new Date(status.lastUpdate) : null;
    const now = new Date();
    const secondsSinceUpdate = lastUpdate ? ((now - lastUpdate) / 1000) : Infinity;
    
    // 状态判定：支持睡眠模式，睡眠状态下忽略超时
    let finalStatus = 'offline';
    if (status?.status === 'sleep' && secondsSinceUpdate < 24 * 3600) {
      // 设备主动上报 sleep，最长保留 24h
      finalStatus = 'sleep';
    } else if (secondsSinceUpdate <= 60) {
      // 正常在线判断，60 秒内视为在线/原状态
      finalStatus = status?.status || 'online';
    } else {
      // 超时且非 sleep，则离线
      finalStatus = 'offline';
    }

    // 今日在线时长（秒），兼容旧字段
    const todayOnlineSeconds = typeof status.todayOnlineSeconds === 'number'
      ? status.todayOnlineSeconds
      : (typeof status.uptime === 'number' ? status.uptime : 0);
    
    // 获取今日统计数据（如果缓存中没有，尝试从文件加载）
    let todayStats = status.todayStats;
    if (!todayStats || !Array.isArray(todayStats) || todayStats.length === 0) {
      // 尝试从文件加载统计数据（主要用于 PC 设备）
      try {
        const stats = loadTodayStats();
        if (stats && stats.apps) {
          // 转换为数组格式
          todayStats = Object.entries(stats.apps)
            .map(([name, data]) => ({
              name,
              duration: data.duration || 0,
              icon: data.icon || "📱"
            }))
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 10); // 只取前10个
        }
      } catch (error) {
        console.warn(`[广播] 加载设备 ${deviceId} 的统计数据失败:`, error.message);
        todayStats = [];
      }
    }
    
    devices[deviceId] = {
      id: status.deviceId || deviceId,
      name: status.deviceName || (deviceId === 'pc' ? "Workstation" : "Mobile"),
      type: status.deviceType || (deviceId === 'pc' ? 'pc' : 'mobile'),
      os: status.deviceOS || (deviceId === 'pc' ? "Windows 11" : "Android"),
      status: finalStatus,
      
      // 手机特有字段
      battery: status.battery, 
      isCharging: status.isCharging, 
      networkType: status.networkType, 
      
      todayOnlineSeconds,
      uptime: formatUptime(todayOnlineSeconds),
      currentApp: status.currentApp || { name: "Unknown", icon: "📱" },
      lastUpdate: status.lastUpdate,
      todayStats: todayStats || [] // 确保包含今日统计数据
    };
  });
  
  // 如果没有任何数据，提供默认 PC 占位
  if (Object.keys(devices).length === 0) {
    devices['pc'] = {
      id: 'pc',
      name: "Workstation",
      type: 'pc',
      os: "Windows 11",
      status: "offline",
      currentApp: { name: "Unknown", icon: "💻" }
    };
  }
  
  const message = JSON.stringify({
    type: 'deviceStatus',
    data: devices, // 发送完整设备列表
    timestamp: new Date().toISOString()
  });
  
  clients.forEach((client) => {
    if (client.readyState === 1) { 
      try {
        client.send(message);
      } catch (error) {
        console.error('[WebSocket] 发送失败:', error);
      }
    }
  });
}

// API 密钥验证中间件（强制验证）
function validateApiKey(req, res, next) {
  // 如果未配置密钥，拒绝所有请求
  if (!API_KEY) {
    return res.status(503).json({
      success: false,
      error: '服务器未配置 API 密钥，请联系管理员'
    });
  }
  
  // 如果明确禁用了密钥验证，允许通过（仅用于开发环境）
  if (REQUIRE_API_KEY === false) {
    return next();
  }
  
  // 从请求头获取密钥
  const providedKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!providedKey) {
    return res.status(401).json({
      success: false,
      error: '缺少 API 密钥，请在请求头中提供 X-API-Key 或 Authorization: Bearer <key>',
      hint: '请在采集器的 .env 文件中配置 API_KEY 环境变量'
    });
  }
  
  // 严格比较密钥（区分大小写）
  if (providedKey !== API_KEY) {
    return res.status(403).json({
      success: false,
      error: 'API 密钥无效，密钥不匹配',
      hint: '请检查采集器配置的 API_KEY 是否与后端配置的 API_KEY 完全一致'
    });
  }
  
  // 密钥验证通过
  next();
}

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 配置 multer 用于文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'avatar') {
      cb(null, avatarDir);
    } else if (file.fieldname === 'bgImage') {
      cb(null, bgImageDir);
    } else {
      cb(null, uploadsDir);
    }
  },
  filename: (req, file, cb) => {
    // 生成唯一文件名：时间戳 + 随机字符串 + 原始扩展名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 限制文件大小为 10MB
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片文件
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件 (JPEG, PNG, GIF, WebP)'));
    }
  }
});

// 提供静态文件服务（上传的图片）
app.use('/uploads', express.static(uploadsDir));

// 提供前端静态文件服务（dist 目录）
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
}

// 对设备上报接口应用密钥验证
app.use('/api/report/*', validateApiKey);

const MOCK_DATA = {
  profile: {
    name: "User",
    status: "online", 
    location: "City, Country",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=User&backgroundColor=ffdfbf",
    bgImage: "https://images.unsplash.com/photo-1518709414768-a88986a4555d?q=80&w=1200&auto=format&fit=crop" 
  },
  steam: {
    profile: {
      name: "User_Steam",
      avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=User&backgroundColor=1e293b",
      level: 1,
      status: "online", 
      game: "Game Name",
      gameCover: "https://images.unsplash.com/photo-1593305841991-05c29736560e?q=80&w=600&auto=format&fit=crop", 
      playtimeTwoWeeks: "0h",
      statusText: "Playing"
    },
    recentGames: [
      { name: "Game 1", time: "0h", icon: "🎮" },
      { name: "Game 2", time: "0h", icon: "🎮" },
      { name: "Game 3", time: "0h", icon: "🎮" }
    ]
  },
  weather: {
    temp: 24,
    condition: "Cloudy", 
    conditionZh: "多云",
    humidity: "65%",
    wind: "3级"
  }
};

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * 将 Steam ID 转换为 SteamID64
 * @param {string} steamId - SteamID64（推荐）或 SteamID32 格式
 * @returns {string|null} SteamID64 或 null
 */
function convertSteamIdTo64(steamId) {
  if (!steamId) return null;
  
  // 如果已经是纯数字（SteamID64），直接返回
  if (/^\d+$/.test(steamId)) {
    return steamId;
  }
  
  // 解析 SteamID32 格式: STEAM_X:Y:Z
  const match = steamId.match(/^STEAM_(\d):(\d):(\d+)$/);
  if (!match) {
    console.warn(`[Steam] 无效的 Steam ID 格式: ${steamId}`);
    return null;
  }
  
  const X = parseInt(match[1]);
  const Y = parseInt(match[2]);
  const Z = parseInt(match[3]);
  
  // SteamID64 = Z * 2 + Y + 76561197960265728
  const steamId64 = BigInt(Z) * 2n + BigInt(Y) + 76561197960265728n;
  return steamId64.toString();
}

/**
 * 使用Steam Web API获取玩家摘要信息
 * @param {string} steamId64 - SteamID64
 * @returns {Promise<object|null>} 玩家信息或 null
 */
async function getSteamPlayerSummaries(steamId64) {
  if (!steamId64 || !STEAM_API_KEY) {
    return null;
  }
  
  try {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/`;
    const response = await axios.get(url, {
      params: {
        key: STEAM_API_KEY,
        steamids: steamId64
      },
      timeout: 10000 // 10秒超时
    });
    
    if (response.data?.response?.players && response.data.response.players.length > 0) {
      return response.data.response.players[0];
    }
    
    return null;
  } catch (error) {
    console.error('[Steam API] 获取玩家摘要失败:', error.message);
    return null;
  }
}

/**
 * 使用Steam Web API获取最近游玩的游戏列表
 * @param {string} steamId64 - SteamID64
 * @returns {Promise<array>} 游戏列表
 */
async function getSteamRecentGames(steamId64) {
  if (!steamId64 || !STEAM_API_KEY) {
    return [];
  }
  
  try {
    const url = `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/`;
    const response = await axios.get(url, {
      params: {
        key: STEAM_API_KEY,
        steamid: steamId64,
        count: 10 // 获取最近10个游戏
      },
      timeout: 10000 // 10秒超时
    });
    
    if (response.data?.response?.games && Array.isArray(response.data.response.games)) {
      return response.data.response.games.map(game => {
        // 格式化时长（分钟转小时）
        const formatPlaytime = (minutes) => {
          if (!minutes || minutes === 0) return '0h';
          const hours = minutes / 60;
          if (hours < 1) {
            return `${minutes}m`;
          }
          return `${hours.toFixed(1)}h`;
        };
        
        return {
          name: game.name || 'Unknown Game',
          appid: game.appid || null,
          playtime_2weeks: formatPlaytime(game.playtime_2weeks || 0),
          playtime_total: formatPlaytime(game.playtime_forever || 0),
          cover: game.appid 
            ? `https://steamcdn-a.akamaihd.net/steam/apps/${game.appid}/library_600x900_2x.jpg`
            : null
        };
      });
    }
    
    return [];
  } catch (error) {
    console.error('[Steam API] 获取游戏列表失败:', error.message);
    // 如果返回空数据（用户最近没玩游戏），返回空数组而不是错误
    if (error.response?.data?.response?.total_count === 0) {
      return [];
    }
    return [];
  }
}

/**
 * 获取Steam用户等级
 * @param {string} steamId64 - SteamID64
 * @returns {Promise<number>} 用户等级
 */
async function getSteamLevel(steamId64) {
  if (!steamId64 || !STEAM_API_KEY) {
    return 0;
  }
  
  try {
    const url = `https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/`;
    const response = await axios.get(url, {
      params: {
        key: STEAM_API_KEY,
        steamid: steamId64
      },
      timeout: 10000
    });
    
    return response.data?.response?.player_level || 0;
  } catch (error) {
    console.warn('[Steam API] 获取用户等级失败:', error.message);
    return 0;
  }
}

/**
 * 从Steam社区页面获取用户信息（不需要API密钥）
 * @param {string} steamId64 - SteamID64
 * @returns {Promise<object|null>} 用户信息或 null
 */
async function getSteamPlayerFromCommunity(steamId64) {
  if (!steamId64) {
    return null;
  }
  
  try {
    // 方法1: 尝试从Steam社区个人资料XML接口获取基本数据
    const profileUrl = `https://steamcommunity.com/profiles/${steamId64}/?xml=1`;
    const response = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/xml,application/xml,application/xhtml+xml,text/html;q=0.9,*/*;q=0.8'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Steam社区请求失败: ${response.status}`);
    }
    
    const xmlText = await response.text();
    
    // 解析XML数据
    const nameMatch = xmlText.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/);
    const avatarFullMatch = xmlText.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/);
    const avatarMediumMatch = xmlText.match(/<avatarMedium><!\[CDATA\[(.*?)\]\]><\/avatarMedium>/);
    const avatarMatch = xmlText.match(/<avatar><!\[CDATA\[(.*?)\]\]><\/avatar>/);
    const stateMatch = xmlText.match(/<stateMessage><!\[CDATA\[(.*?)\]\]><\/stateMessage>/);
    const gameMatch = xmlText.match(/<gameExtraInfo><!\[CDATA\[(.*?)\]\]><\/gameExtraInfo>/);
    const gameIdMatch = xmlText.match(/<gameID>(.*?)<\/gameID>/);
    const onlineStateMatch = xmlText.match(/<onlineState>(.*?)<\/onlineState>/);
    
    // 方法2: 从HTML页面获取等级和游戏信息（更准确）
    let steamLevel = null;
    let gameInfo = null;
    try {
      const htmlUrl = `https://steamcommunity.com/profiles/${steamId64}`;
      const htmlResponse = await fetch(htmlUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      
      if (htmlResponse.ok) {
        const htmlText = await htmlResponse.text();
        
        // 从HTML中解析等级：<span class="friendPlayerLevelNum">68</span>
        const levelMatch = htmlText.match(/<span class="friendPlayerLevelNum">(\d+)<\/span>/);
        if (levelMatch) {
          steamLevel = parseInt(levelMatch[1]);
        }
        
        // 从HTML中解析正在游玩的游戏
        // 尝试多种可能的HTML结构来获取游戏信息
        let gameName = null;
        let gameId = null;
        let gameIconUrl = null;
        let gameHeaderUrl = null;
        
        // 方法1: 查找游戏图标 <img src="https://cdn.fastly.steamstatic.com/steamcommunity/public/images/apps/{gameId}/{hash}.jpg">
        const gameIconMatch = htmlText.match(/<img[^>]*src="https:\/\/cdn\.fastly\.steamstatic\.com\/steamcommunity\/public\/images\/apps\/(\d+)\/([^"]+\.jpg)"[^>]*>/i);
        if (gameIconMatch) {
          gameId = gameIconMatch[1];
          gameIconUrl = `https://cdn.fastly.steamstatic.com/steamcommunity/public/images/apps/${gameIconMatch[1]}/${gameIconMatch[2]}`;
        }
        
        // 方法2: 查找游戏横幅图 <img class="game_header_image_full" src="https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{gameId}/header.jpg">
        const gameHeaderMatch = htmlText.match(/<img[^>]*class="[^"]*game_header_image[^"]*"[^>]*src="https:\/\/shared\.fastly\.steamstatic\.com\/store_item_assets\/steam\/apps\/(\d+)\/header\.jpg[^"]*"[^>]*>/i);
        if (gameHeaderMatch) {
          if (!gameId) {
            gameId = gameHeaderMatch[1];
          }
          // 提取完整的URL（包含查询参数）
          const fullHeaderMatch = htmlText.match(/<img[^>]*class="[^"]*game_header_image[^"]*"[^>]*src="(https:\/\/shared\.fastly\.steamstatic\.com\/store_item_assets\/steam\/apps\/\d+\/header\.jpg[^"]*)"[^>]*>/i);
          if (fullHeaderMatch) {
            gameHeaderUrl = fullHeaderMatch[1];
          } else {
            gameHeaderUrl = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${gameHeaderMatch[1]}/header.jpg`;
          }
        }
        
        // 方法3: 查找 <div class="profile_in_game_name">
        const gameNameMatch1 = htmlText.match(/<div class="profile_in_game_name"[^>]*>(.*?)<\/div>/s);
        if (gameNameMatch1) {
          gameName = gameNameMatch1[1].trim().replace(/<[^>]+>/g, ''); // 移除HTML标签
        }
        
        // 方法4: 查找游戏链接中的游戏ID和名称
        const gameLinkMatch = htmlText.match(/<a[^>]*href="https:\/\/store\.steampowered\.com\/app\/(\d+)"[^>]*>([^<]+)<\/a>/);
        if (gameLinkMatch) {
          if (!gameId) {
            gameId = gameLinkMatch[1];
          }
          if (!gameName) {
            gameName = gameLinkMatch[2].trim();
          }
        }
        
        // 方法5: 查找 steam://rungameid/ 链接
        if (!gameId) {
          const runGameMatch = htmlText.match(/steam:\/\/rungameid\/(\d+)/);
          if (runGameMatch) {
            gameId = runGameMatch[1];
          }
        }
        
        // 如果找到了游戏名称或游戏ID，构建游戏信息
        if (gameName || gameId) {
          gameInfo = {
            name: gameName || 'Unknown Game',
            gameId: gameId,
            gameCover: gameHeaderUrl || (gameId 
              ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${gameId}/header.jpg`
              : null),
            gameIcon: gameIconUrl || null
          };
        }
      }
    } catch (htmlError) {
      console.warn('[Steam社区] 从HTML获取信息失败，使用XML数据:', htmlError.message);
    }
    
    if (nameMatch) {
      // 判断在线状态：onlineState可能是 "online", "offline", "in-game" 等
      let personastate = 0; // 默认离线
      if (onlineStateMatch) {
        const state = onlineStateMatch[1].toLowerCase();
        if (state === 'online' || state === 'in-game') {
          personastate = 1;
        }
      } else if (gameMatch) {
        personastate = 1; // 有游戏信息说明在线
      }
      
      return {
        personaname: nameMatch[1],
        avatarfull: avatarFullMatch ? avatarFullMatch[1] : (avatarMediumMatch ? avatarMediumMatch[1].replace('_medium', '_full') : null),
        avatarmedium: avatarMediumMatch ? avatarMediumMatch[1] : (avatarMatch ? avatarMatch[1].replace('_', '_medium') : null),
        avatar: avatarMatch ? avatarMatch[1] : (avatarMediumMatch ? avatarMediumMatch[1].replace('_medium', '') : null),
        personastate: personastate,
        gameextrainfo: gameInfo ? gameInfo.name : (gameMatch ? gameMatch[1] : null), // 优先使用HTML获取的游戏名
        gameid: gameInfo ? gameInfo.gameId : (gameIdMatch ? gameIdMatch[1] : null), // 优先使用HTML获取的游戏ID
        steamLevel: steamLevel, // 从HTML获取的等级
        gameInfo: gameInfo // 保存完整的游戏信息
      };
    }
    
    return null;
  } catch (error) {
    console.error('[Steam社区] 获取用户信息失败:', error.message);
    return null;
  }
}

/**
 * 获取 Steam 用户信息（优先使用API，如果没有API密钥则使用社区页面）
 * @param {string} steamId64 - SteamID64
 * @returns {Promise<object|null>} 用户信息或 null
 */
async function getSteamPlayerSummary(steamId64) {
  if (!steamId64) {
    return null;
  }
  
  // 如果有API密钥，优先使用官方API
  if (STEAM_API_KEY) {
    try {
      const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId64}`;
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.response && data.response.players && data.response.players.length > 0) {
          return data.response.players[0];
        }
      }
    } catch (error) {
      console.warn('[Steam API] 使用API密钥获取失败，尝试社区页面:', error.message);
    }
  }
  
  // 如果没有API密钥或API失败，使用社区页面
  return await getSteamPlayerFromCommunity(steamId64);
}



/**
 * 获取当前正在游玩的游戏信息
 * @param {object} playerSummary - 从 GetPlayerSummaries 获取的玩家信息
 * @returns {object|null} 游戏信息或 null
 */
function getCurrentGame(playerSummary) {
  if (!playerSummary || !playerSummary.gameextrainfo) {
    return null;
  }
  
  // 如果已经有从HTML获取的完整游戏信息，直接使用
  if (playerSummary.gameInfo) {
    return playerSummary.gameInfo;
  }
  
  // 否则使用从API或XML获取的信息，使用正确的URL格式
  return {
    name: playerSummary.gameextrainfo,
    gameId: playerSummary.gameid || null,
    gameCover: playerSummary.gameid 
      ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${playerSummary.gameid}/header.jpg`
      : null,
    gameIcon: null // 图标需要从HTML中解析，这里无法获取
  };
}

/**
 * 转换 Steam 在线状态
 * @param {number} personastate - Steam personastate 值
 * @param {string} gameextrainfo - 游戏名称（如果有）
 * @returns {object} { status, statusText }
 */
function convertSteamStatus(personastate, gameextrainfo) {
  const statusMap = {
    0: { status: 'offline', statusText: '离线' },
    1: { status: 'online', statusText: '在线' },
    2: { status: 'online', statusText: '忙碌' },
    3: { status: 'online', statusText: '离开' },
    4: { status: 'online', statusText: '打盹' },
    5: { status: 'online', statusText: '想交易' },
    6: { status: 'online', statusText: '想玩游戏' }
  };
  
  const baseStatus = statusMap[personastate] || statusMap[0];
  
  if (gameextrainfo) {
    return {
      status: 'online',
      statusText: `正在游玩 ${gameextrainfo}`
    };
  }
  
  return baseStatus;
}

/**
 * 构建 Steam 状态响应数据（用于轮询和即时返回）
 * @returns {Promise<object>} Steam 状态响应
 */
async function buildSteamStatusResponse() {
  const timestamp = new Date().toISOString();

  // 基础配置校验
  if (!STEAM_ID) {
    console.log('[Steam] 未配置 Steam ID');
    return {
      success: false,
      error: '未配置Steam ID',
      errorCode: 'NOT_CONFIGURED',
      message: '请在 config/platforms.json 中配置 steam.api.steamId64',
      timestamp
    };
  }

  if (!STEAM_API_KEY) {
    console.log('[Steam] 未配置 Steam API Key');
    return {
      success: false,
      error: '未配置Steam API Key',
      errorCode: 'NOT_CONFIGURED',
      message: '请在环境变量 STEAM_API_KEY 中配置 Steam Web API 密钥',
      timestamp
    };
  }

  // 转换 Steam ID 到 SteamID64（如果输入是SteamID64则直接使用）
  const steamId64 = convertSteamIdTo64(STEAM_ID);
  if (!steamId64) {
    console.warn('[Steam] SteamID 转换失败');
    return {
      success: false,
      error: 'Steam ID格式错误',
      errorCode: 'INVALID_STEAM_ID',
      timestamp
    };
  }

  try {
    // 并行请求玩家摘要、游戏列表和等级
    const [playerSummary, recentGames, level] = await Promise.all([
      getSteamPlayerSummaries(steamId64),
      getSteamRecentGames(steamId64),
      getSteamLevel(steamId64)
    ]);

    if (!playerSummary) {
      console.warn('[Steam] 无法获取用户信息');
      return {
        success: false,
        error: 'API请求失败',
        errorCode: 'API_REQUEST_FAILED',
        message: '无法从Steam API获取用户信息',
        timestamp
      };
    }

    // 处理在线状态
    // personastate: 0=离线, 1=在线, 2=忙碌, 3=离开, 4=打盹, 5=想交易, 6=想玩游戏
    let status = 'offline';
    let statusText = '离线';
    if (playerSummary.personastate === 0) {
      status = 'offline';
      statusText = '离线';
    } else {
      status = 'online';
      const statusMap = {
        1: '在线',
        2: '忙碌',
        3: '离开',
        4: '打盹',
        5: '想交易',
        6: '想玩游戏'
      };
      statusText = statusMap[playerSummary.personastate] || '在线';
    }

    // 检查是否正在游戏中
    let nowPlaying = null;
    if (playerSummary.gameextrainfo) {
      // 如果存在gameextrainfo，说明用户正在玩这款游戏
      status = 'in-game';
      statusText = `正在游玩 ${playerSummary.gameextrainfo}`;
      nowPlaying = {
        name: playerSummary.gameextrainfo,
        appid: playerSummary.gameid || null,
        cover: playerSummary.gameid 
          ? `https://steamcdn-a.akamaihd.net/steam/apps/${playerSummary.gameid}/library_600x900_2x.jpg`
          : null
      };
    }

    // 构建清晰的JSON响应
    const steamData = {
      // 用户基本信息
      nickname: playerSummary.personaname || 'Unknown',
      avatar: playerSummary.avatarfull || playerSummary.avatarmedium || playerSummary.avatar || '',
      level: level,
      steamId64: steamId64,

      // 在线状态
      status: status,
      statusText: statusText,
      personastate: playerSummary.personastate || 0, // 保存原始personastate值用于前端判断

      // 当前游戏（如果正在游戏中）
      now_playing: nowPlaying,

      // 最近游玩的游戏列表
      recent_games: recentGames
    };

    // 为了兼容前端，同时提供旧格式的数据
    const legacyData = {
      profile: {
        name: steamData.nickname,
        avatar: steamData.avatar,
        level: steamData.level,
        status: steamData.status,
        statusText: steamData.statusText,
        personastate: steamData.personastate, // 传递原始personastate值
        game: nowPlaying?.name || null,
        gameCover: nowPlaying?.cover || null,
        gameIcon: nowPlaying?.cover || null,
        gameId: nowPlaying?.appid || null,
        playtimeTwoWeeks: '0h',
        steamId64: steamId64
      },
      recentGames: recentGames.map(game => ({
        name: game.name,
        time: game.playtime_2weeks,
        icon: '🎮',
        cover: game.cover,
        appid: game.appid || null  // 添加 appid 字段，用于生成 Steam 商店链接
      }))
    };

    return {
      success: true,
      data: legacyData, // 保持前端兼容性
      apiData: steamData, // 新的API格式数据
      timestamp
    };
  } catch (error) {
    console.error('[Steam API] 错误:', error);
    return {
      success: false,
      error: 'API请求失败',
      errorCode: 'API_REQUEST_FAILED',
      message: error.message,
      timestamp
    };
  }
}

/**
 * 刷新 Steam 缓存（后端轮询入口）
 * @param {string} reason - 触发原因（便于日志）
 * @returns {Promise<object>} 最新的 Steam 数据
 */
async function refreshSteamCache(reason = 'polling') {
  const result = await buildSteamStatusResponse();
  
  if (result.success) {
    steamCache = {
      result,
      lastUpdated: result.timestamp,
      lastError: null
    };
  } else {
    steamCache = {
      ...steamCache,
      result,
      lastError: { ...result, reason }
    };
  }

  return steamCache.result;
}

// 启动后端轮询
const startSteamPolling = () => {
  if (steamPollingTimer) {
    return;
  }

  // 立即拉取一次，后续每分钟更新
  refreshSteamCache('startup');
  steamPollingTimer = setInterval(() => refreshSteamCache('scheduled'), STEAM_POLL_INTERVAL);
  console.log(`[Steam] 后端轮询已启动，间隔 ${STEAM_POLL_INTERVAL / 1000}s`);
};

startSteamPolling();

// GET /api/status/steam - 返回 Steam 状态数据（使用Steam Web API）
app.get('/api/status/steam', async (req, res) => {
  try {
    // 优先返回缓存；如果未初始化则立即刷新一次
    if (!steamCache.result) {
      await refreshSteamCache('first-request');
    }

    if (!steamCache.result) {
      return res.json({
        success: false,
        error: 'Steam 数据暂不可用',
        errorCode: 'NO_DATA',
        timestamp: new Date().toISOString()
      });
    }

    res.json(steamCache.result);
  } catch (error) {
    console.error('[Steam API] 错误:', error);
    // 出错时返回错误信息
    res.json({
      success: false,
      error: 'API请求失败',
      errorCode: 'API_REQUEST_FAILED',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/config/platforms - 返回平台配置
app.get('/api/config/platforms', (req, res) => {
  try {
    // 创建配置副本，移除敏感信息
    const safeConfig = JSON.parse(JSON.stringify(PLATFORM_CONFIG));
    
    // 移除所有 API 密钥和密码
    if (safeConfig.steam?.api) {
      delete safeConfig.steam.api.apiKey;
    }
    if (safeConfig.bilibili?.api) {
      delete safeConfig.bilibili.api.apiKey;
      delete safeConfig.bilibili.api.sessdata;
    }
    if (safeConfig.github?.api) {
      delete safeConfig.github.api.token;
    }
    if (safeConfig.discord?.api) {
      delete safeConfig.discord.api.token;
    }
    if (safeConfig.spotify?.api) {
      delete safeConfig.spotify.api.clientSecret;
    }
    if (safeConfig.weather?.api?.qweather) {
        delete safeConfig.weather.api.qweather.apiKey;
    }
    
    res.json({
      success: true,
      data: safeConfig,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 获取 Bilibili 用户信息
 * @param {string} uid - Bilibili 用户ID
 * @param {boolean} useCache - 是否使用缓存
 * @returns {Promise<object|null>} 用户信息或 null
 */
async function getBilibiliUserInfo(uid, useCache = true) {
  if (!uid) {
    return null;
  }
  
  // 检查缓存
  if (useCache) {
    const cached = getCachedData('userInfo');
    if (cached) {
      console.log('[Bilibili API] 使用缓存的用户信息');
      return cached;
    }
  }
  
  // 随机延迟（模拟人类行为，降低触发风控的概率）
  await randomDelay(500, 2000);
  
  // 构建请求头（使用随机 User-Agent）
  const headers = {
    'User-Agent': getRandomUserAgent(),
    'Referer': 'https://www.bilibili.com/',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site'
  };
  
  // 添加 Cookie
  if (BILIBILI_SESSDATA) {
    headers['Cookie'] = `SESSDATA=${BILIBILI_SESSDATA}`;
  }
  
  // 先尝试新版 WBI API
  let url = `https://api.bilibili.com/x/space/wbi/acc/info`;
  let response = null;
  let useWbi = true;
  
  try {
    // 获取 WBI Keys 并计算签名
    const wbiKeys = await getWbiKeys();
    let params = { mid: uid };
    
    if (wbiKeys) {
      // 计算 WBI 签名
      const signature = encWbi(params, wbiKeys.imgKey, wbiKeys.subKey);
      params.w_rid = signature.w_rid;
      params.wts = signature.wts;
      console.log('[Bilibili API] 已计算 WBI 签名');
    } else {
      console.warn('[Bilibili API] 无法获取 WBI Keys，将尝试旧版 API');
    }
    
    response = await axios.get(url, {
      params: params,
      headers: headers,
      timeout: 10000
    });
    
    // 如果 WBI API 失败（-352 或其他错误），尝试旧版 API
    if (response.data && response.data.code !== 0 && 
        (response.data.code === -401 || response.data.code === -403 || response.data.code === -352)) {
      console.log(`[Bilibili API] WBI API 失败 (code=${response.data.code})，尝试旧版 API`);
      useWbi = false;
      url = `https://api.bilibili.com/x/space/acc/info`;
      response = await axios.get(url, {
        params: { mid: uid },
        headers: headers,
        timeout: 10000
      });
    }
  } catch (error) {
    // 如果 WBI API 请求失败，尝试旧版
    if (useWbi) {
      try {
        console.log('[Bilibili API] WBI API 请求异常，尝试旧版 API');
        url = `https://api.bilibili.com/x/space/acc/info`;
        response = await axios.get(url, {
          params: { mid: uid },
          headers: headers,
          timeout: 10000
        });
        useWbi = false;
      } catch (retryError) {
        // 检查错误码
        if (retryError.response?.data) {
          const errorCode = retryError.response.data.code;
          if (errorCode === -401 || errorCode === -403 || errorCode === -352) {
            console.error(`[Bilibili API] 获取用户信息失败: code=${errorCode}, message=${retryError.response.data.message}`);
            if (errorCode === -352) {
              console.error('[Bilibili API] 提示: WBI 签名验证失败，可能是 keys 过期，将重新获取');
              wbiKeysCache = { imgKey: null, subKey: null, timestamp: 0 };
            } else {
              console.error('[Bilibili API] 提示: 请检查环境变量 BILIBILI_SESSDATA 是否过期');
            }
            const staleCache = getStaleCache('userInfo');
            if (staleCache) {
              console.warn('[Bilibili API] API失败，降级使用旧缓存 (userInfo)');
              return staleCache;
            }
            return null;
          }
          if (errorCode === -799) {
            console.warn('[Bilibili API] 请求过于频繁 (-799)，尝试使用缓存数据');
            const staleCache = getStaleCache('userInfo');
            if (staleCache) {
              console.warn('[Bilibili API] API失败，降级使用旧缓存 (userInfo)');
              return staleCache;
            }
            return null;
          }
        }
        throw retryError;
      }
    } else {
      // 处理非 WBI 的错误
      if (error.response?.data) {
        const errorCode = error.response.data.code;
        if (errorCode === -401 || errorCode === -403 || errorCode === -352) {
          console.error(`[Bilibili API] 获取用户信息失败: code=${errorCode}, message=${error.response.data.message}`);
          if (errorCode === -352) {
            console.error('[Bilibili API] 提示: WBI 签名验证失败，可能是 keys 过期，将重新获取');
            wbiKeysCache = { imgKey: null, subKey: null, timestamp: 0 };
          } else {
            console.error('[Bilibili API] 提示: 请检查环境变量 BILIBILI_SESSDATA 是否过期');
          }
          const staleCache = getStaleCache('userInfo');
          if (staleCache) {
            console.warn('[Bilibili API] API失败，降级使用旧缓存 (userInfo)');
            return staleCache;
          }
          return null;
        }
        if (errorCode === -799) {
          console.warn('[Bilibili API] 请求过于频繁 (-799)，尝试使用缓存数据');
            const staleCache = getStaleCache('userInfo');
            if (staleCache) {
              console.warn('[Bilibili API] API失败，降级使用旧缓存 (userInfo)');
              return staleCache;
            }
            return null;
        }
      }
      throw error;
    }
  }
  
  // 处理响应
  if (response && response.data) {
    // 检查错误码
    if (response.data.code === -401 || response.data.code === -403 || response.data.code === -352) {
      console.error(`[Bilibili API] 获取用户信息失败: code=${response.data.code}, message=${response.data.message}`);
      if (response.data.code === -352) {
        console.error('[Bilibili API] 提示: WBI 签名验证失败，可能是 keys 过期，将重新获取');
        // 清除 WBI keys 缓存，强制重新获取
        wbiKeysCache = { imgKey: null, subKey: null, timestamp: 0 };
      } else {
        console.error('[Bilibili API] 提示: 请检查环境变量 BILIBILI_SESSDATA 是否过期');
      }
      
      // 尝试返回缓存
      const cached = getCachedData('userInfo');
      if (cached) {
        console.log('[Bilibili API] 使用缓存的用户信息（降级）');
        return cached;
      }
      return null;
    }
    
    if (response.data.code === -799) {
      console.warn('[Bilibili API] 请求过于频繁 (-799)，使用缓存数据');
      const cached = getCachedData('userInfo');
      if (cached) {
        return cached;
      }
      return null;
    }
    
    if (response.data.code !== 0) {
      console.error(`[Bilibili API] 获取用户信息失败: code=${response.data.code}, message=${response.data.message || '未知错误'}`);
      const cached = getCachedData('userInfo');
      if (cached) {
        return cached;
      }
      return null;
    }
    
    if (response.data.data) {
      const data = response.data.data;
      // 处理头像URL
      let avatarUrl = data.face || '';
      if (avatarUrl) {
        if (avatarUrl.startsWith('//')) {
          avatarUrl = `https:${avatarUrl}`;
        } else if (!avatarUrl.startsWith('http')) {
          avatarUrl = `https:${avatarUrl}`;
        }
      }
      
      const userInfo = {
        username: data.name || 'Unknown',
        avatar: avatarUrl,
        bio: data.sign || '',
        level: data.level || 0,
        followers: 0,
        following: 0
      };
      
      // 存入缓存
      setCachedData('userInfo', userInfo);
      console.log(`[Bilibili API] 用户信息: ${userInfo.username}, 等级: ${userInfo.level}`);
      
      return userInfo;
    }
  }
  
  console.warn('[Bilibili API] 响应数据格式异常');
  const staleCache = getStaleCache('userInfo');
  if (staleCache) {
    console.warn('[Bilibili API] API失败，降级使用旧缓存 (userInfo)');
  }
  return staleCache || null;
}

/**
 * 获取 Bilibili 用户统计数据（粉丝数、关注数）
 * @param {string} uid - Bilibili 用户ID
 * @param {boolean} useCache - 是否使用缓存
 * @returns {Promise<object|null>} 统计数据或 null
 */
async function getBilibiliUserStats(uid, useCache = true) {
  if (!uid) {
    return null;
  }
  
  // 检查缓存
  if (useCache) {
    const cached = getCachedData('userStats');
    if (cached) {
      console.log('[Bilibili API] 使用缓存的统计数据');
      return cached;
    }
  }
  
  // 随机延迟（模拟人类行为，降低触发风控的概率）
  await randomDelay(500, 2000);
  
  // 构建请求头（使用随机 User-Agent）
  const headers = {
    'User-Agent': getRandomUserAgent(),
    'Referer': 'https://www.bilibili.com/',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site'
  };
  
  // 添加 Cookie
  if (BILIBILI_SESSDATA) {
    headers['Cookie'] = `SESSDATA=${BILIBILI_SESSDATA}`;
  }
  
  try {
    const url = `https://api.bilibili.com/x/relation/stat`;
    const response = await axios.get(url, {
      params: { vmid: uid },
      headers: headers,
      timeout: 10000
    });
    
    if (response.data) {
      // 处理错误码
      if (response.data.code === -401 || response.data.code === -403) {
        console.error(`[Bilibili API] 获取统计数据失败: code=${response.data.code}, message=${response.data.message}`);
        console.error('[Bilibili API] 提示: 请检查环境变量 BILIBILI_SESSDATA 是否过期');
        const staleCache = getStaleCache('userStats');
        if (staleCache) {
          console.warn('[Bilibili API] API失败，降级使用旧缓存 (userStats)');
          return staleCache;
        }
        return null;
      }
      
      if (response.data.code === -799) {
        console.warn('[Bilibili API] 请求过于频繁 (-799)，使用缓存数据');
        const staleCache = getStaleCache('userStats');
        if (staleCache) {
          console.warn('[Bilibili API] API失败，降级使用旧缓存 (userStats)');
          return staleCache;
        }
        return null;
      }
      
      if (response.data.code === 0 && response.data.data) {
        const data = response.data.data;
        const stats = {
          followers: data.follower || 0,
          following: data.following || 0
        };
        
        // 存入缓存
        setCachedData('userStats', stats);
        console.log(`[Bilibili API] 统计数据: 粉丝 ${stats.followers}, 关注 ${stats.following}`);
        return stats;
      } else if (response.data.code !== 0) {
        console.warn(`[Bilibili API] 获取统计数据失败: code=${response.data.code}, message=${response.data.message || '未知错误'}`);
        const staleCache = getStaleCache('userStats');
        if (staleCache) {
          console.warn('[Bilibili API] API失败，降级使用旧缓存 (userStats)');
        }
        return staleCache || null;
      }
    }
    
    return null;
  } catch (error) {
    // 检查是否是 -799 错误
    if (error.response?.data?.code === -799) {
      console.warn('[Bilibili API] 请求过于频繁 (-799)，使用缓存数据');
      const staleCache = getStaleCache('userStats');
      if (staleCache) {
        console.warn('[Bilibili API] API失败，降级使用旧缓存 (userStats)');
        return staleCache;
      }
    }
    
    console.error('[Bilibili API] 获取统计数据失败:', error.message);
    if (error.response) {
      console.error(`[Bilibili API] HTTP ${error.response.status}:`, error.response.data);
    }
    
    // 尝试返回缓存（降级使用过期缓存）
    const staleCache = getStaleCache('userStats');
    if (staleCache) {
      console.warn('[Bilibili API] API失败，降级使用旧缓存 (userStats)');
    }
    return staleCache || null;
  }
}

/**
 * 获取 Bilibili 用户最新视频列表
 * @param {string} uid - Bilibili 用户ID
 * @param {boolean} useCache - 是否使用缓存
 * @returns {Promise<array>} 视频列表
 */
async function getBilibiliVideos(uid, useCache = true) {
  if (!uid) {
    return [];
  }
  
  // 检查缓存
  if (useCache) {
    const cached = getCachedData('videos');
    if (cached) {
      console.log('[Bilibili API] 使用缓存的视频列表');
      return cached;
    }
  }
  
  // 随机延迟（模拟人类行为，降低触发风控的概率）
  await randomDelay(500, 2000);
  
  // 构建请求头（使用随机 User-Agent）
  const headers = {
    'User-Agent': getRandomUserAgent(),
    'Referer': 'https://www.bilibili.com/',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site'
  };
  
  // 添加 Cookie
  if (BILIBILI_SESSDATA) {
    headers['Cookie'] = `SESSDATA=${BILIBILI_SESSDATA}`;
  }
  
  // 格式化时间的辅助函数
  const formatDate = (timestamp) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return '今天';
    if (days === 1) return '1天前';
    if (days < 7) return `${days}天前`;
    if (days < 30) return `${Math.floor(days / 7)}周前`;
    if (days < 365) return `${Math.floor(days / 30)}个月前`;
    return `${Math.floor(days / 365)}年前`;
  };
  
  // 先尝试新版 WBI API
  let url = `https://api.bilibili.com/x/space/wbi/arc/search`;
  let response = null;
  let useWbi = true;
  
  try {
    // 获取 WBI Keys 并计算签名
    const wbiKeys = await getWbiKeys();
    let params = {
      mid: uid,
      ps: 5,
      pn: 1
    };
    
    if (wbiKeys) {
      // 计算 WBI 签名
      const signature = encWbi(params, wbiKeys.imgKey, wbiKeys.subKey);
      params.w_rid = signature.w_rid;
      params.wts = signature.wts;
      console.log('[Bilibili API] 已计算 WBI 签名（视频列表）');
    } else {
      console.warn('[Bilibili API] 无法获取 WBI Keys，将尝试旧版 API');
    }
    
    response = await axios.get(url, {
      params: params,
      headers: headers,
      timeout: 10000
    });
    
    // 如果 WBI API 失败（-352 或其他错误），尝试旧版 API
    if (response.data && response.data.code !== 0 && 
        (response.data.code === -401 || response.data.code === -403 || response.data.code === -352)) {
      console.log(`[Bilibili API] WBI API 失败 (code=${response.data.code})，尝试旧版 API`);
      useWbi = false;
      url = `https://api.bilibili.com/x/space/arc/search`;
      response = await axios.get(url, {
        params: {
          mid: uid,
          ps: 5,
          pn: 1,
          order: 'pubdate'
        },
        headers: headers,
        timeout: 10000
      });
    }
  } catch (error) {
    // 如果 WBI API 请求失败，尝试旧版
    if (useWbi) {
      try {
        console.log('[Bilibili API] WBI API 请求异常，尝试旧版 API');
        url = `https://api.bilibili.com/x/space/arc/search`;
        response = await axios.get(url, {
          params: {
            mid: uid,
            ps: 5,
            pn: 1,
            order: 'pubdate'
          },
          headers: headers,
          timeout: 10000
        });
        useWbi = false;
      } catch (retryError) {
        // 检查错误码
        if (retryError.response?.data) {
          const errorCode = retryError.response.data.code;
          if (errorCode === -401 || errorCode === -403 || errorCode === -352) {
            console.error(`[Bilibili API] 获取视频列表失败: code=${errorCode}, message=${retryError.response.data.message}`);
            if (errorCode === -352) {
              console.error('[Bilibili API] 提示: WBI 签名验证失败，可能是 keys 过期，将重新获取');
              wbiKeysCache = { imgKey: null, subKey: null, timestamp: 0 };
            } else {
              console.error('[Bilibili API] 提示: 请检查环境变量 BILIBILI_SESSDATA 是否过期');
            }
            const staleCache = getStaleCache('videos');
            if (staleCache) {
              console.warn('[Bilibili API] API失败，降级使用旧缓存 (videos)');
              return staleCache;
            }
            return [];
          }
          if (errorCode === -799) {
            console.warn('[Bilibili API] 请求过于频繁 (-799)，使用缓存数据');
            const staleCache = getStaleCache('videos');
            if (staleCache) {
              console.warn('[Bilibili API] API失败，降级使用旧缓存 (videos)');
              return staleCache;
            }
            return [];
          }
        }
        throw retryError;
      }
    } else {
      // 处理非 WBI 的错误
      if (error.response?.data) {
        const errorCode = error.response.data.code;
        if (errorCode === -401 || errorCode === -403 || errorCode === -352) {
          console.error(`[Bilibili API] 获取视频列表失败: code=${errorCode}, message=${error.response.data.message}`);
          if (errorCode === -352) {
            console.error('[Bilibili API] 提示: WBI 签名验证失败，可能是 keys 过期，将重新获取');
            wbiKeysCache = { imgKey: null, subKey: null, timestamp: 0 };
          } else {
            console.error('[Bilibili API] 提示: 请检查环境变量 BILIBILI_SESSDATA 是否过期');
          }
          const staleCache = getStaleCache('videos');
          if (staleCache) {
            console.warn('[Bilibili API] API失败，降级使用旧缓存 (videos)');
            return staleCache;
          }
          return [];
        }
        if (errorCode === -799) {
          console.warn('[Bilibili API] 请求过于频繁 (-799)，使用缓存数据');
            const staleCache = getStaleCache('videos');
            if (staleCache) {
              console.warn('[Bilibili API] API失败，降级使用旧缓存 (videos)');
              return staleCache;
            }
            return [];
        }
      }
      throw error;
    }
  }
  
  // 处理响应
  if (response && response.data) {
    // 检查错误码
    if (response.data.code === -401 || response.data.code === -403 || response.data.code === -352) {
      console.error(`[Bilibili API] 获取视频列表失败: code=${response.data.code}, message=${response.data.message}`);
      if (response.data.code === -352) {
        console.error('[Bilibili API] 提示: WBI 签名验证失败，可能是 keys 过期，将重新获取');
        // 清除 WBI keys 缓存，强制重新获取
        wbiKeysCache = { imgKey: null, subKey: null, timestamp: 0 };
      } else {
        console.error('[Bilibili API] 提示: 请检查环境变量 BILIBILI_SESSDATA 是否过期');
      }
      const staleCache = getStaleCache('videos');
      if (staleCache) {
        console.warn('[Bilibili API] API失败，降级使用旧缓存 (videos)');
        return staleCache;
      }
      return [];
    }
    
    if (response.data.code === -799) {
          console.warn('[Bilibili API] 请求过于频繁 (-799)，使用缓存数据');
            const staleCache = getStaleCache('videos');
            if (staleCache) {
              console.warn('[Bilibili API] API失败，降级使用旧缓存 (videos)');
              return staleCache;
            }
            return [];
    }
    
    if (response.data.code === 0 && response.data.data?.list?.vlist) {
      const videos = response.data.data.list.vlist.map(video => {
        // 处理缩略图 URL
        let thumbnail = video.pic || '';
        if (thumbnail) {
          if (thumbnail.startsWith('//')) {
            thumbnail = `https:${thumbnail}`;
          } else if (!thumbnail.startsWith('http')) {
            thumbnail = `https:${thumbnail}`;
          }
        }
        
        return {
          title: video.title || '无标题',
          thumbnail: thumbnail,
          date: formatDate(video.created),
          bvid: video.bvid || '',
          aid: video.aid || ''
        };
      });
      
      // 存入缓存
      setCachedData('videos', videos);
      console.log(`[Bilibili API] 获取到 ${videos.length} 个视频`);
      return videos;
    } else if (response.data.code !== 0) {
      console.warn(`[Bilibili API] 获取视频列表失败: code=${response.data.code}, message=${response.data.message || '未知错误'}`);
      const staleCache = getStaleCache('videos');
      if (staleCache) {
        console.warn('[Bilibili API] API失败，降级使用旧缓存 (videos)');
        return staleCache;
      }
    }
  }
  
  // 尝试返回缓存（降级使用过期缓存）
  const staleCache = getStaleCache('videos');
  if (staleCache) {
    console.warn('[Bilibili API] API失败，降级使用旧缓存 (videos)');
  }
  return staleCache || [];
}

/**
 * 获取 Bilibili 用户收藏夹
 * @param {string} uid - Bilibili 用户ID
 * @param {boolean} useCache - 是否使用缓存
 * @returns {Promise<array>} 收藏夹列表（包含收藏夹信息和内容）
 */
async function getBilibiliFavorites(uid, useCache = true) {
  if (!uid) {
    return [];
  }
  
  // 检查缓存
  if (useCache) {
    const cached = getCachedData('favorites');
    if (cached) {
      console.log('[Bilibili API] 使用缓存的收藏夹');
      return cached;
    }
  }
  
  // 随机延迟（模拟人类行为，降低触发风控的概率）
  await randomDelay(500, 2000);
  
  // 构建请求头（使用随机 User-Agent）
  const headers = {
    'User-Agent': getRandomUserAgent(),
    'Referer': 'https://www.bilibili.com/',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site'
  };
  
  // 添加 Cookie
  if (BILIBILI_SESSDATA) {
    headers['Cookie'] = `SESSDATA=${BILIBILI_SESSDATA}`;
  }
  
  try {
    // 第一步：获取收藏夹列表
    const folderListUrl = `https://api.bilibili.com/x/v3/fav/folder/created/list`;
    const folderListResponse = await axios.get(folderListUrl, {
      params: {
        up_mid: uid,
        pn: 1,
        ps: 5 // 只获取前5个收藏夹
      },
      headers: headers,
      timeout: 10000
    });
    
    if (folderListResponse.data && folderListResponse.data.code === 0 && folderListResponse.data.data?.list) {
      const folders = folderListResponse.data.data.list;
      
      if (folders.length === 0) {
        console.log('[Bilibili API] 用户没有收藏夹');
        return [];
      }
      
      // 获取第一个收藏夹的内容
      const firstFolder = folders[0];
      const mediaId = firstFolder.id;
      
      // 等待500ms后获取收藏夹内容
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 第二步：获取收藏夹内容
      const resourceListUrl = `https://api.bilibili.com/x/v3/fav/resource/list`;
      const resourceListResponse = await axios.get(resourceListUrl, {
        params: {
          media_id: mediaId,
          pn: 1,
          ps: 10 // 获取前10个收藏
        },
        headers: headers,
        timeout: 10000
      });
      
      if (resourceListResponse.data && resourceListResponse.data.code === 0 && resourceListResponse.data.data?.medias) {
        const medias = resourceListResponse.data.data.medias;
        
        // 格式化收藏夹数据
        const favorites = medias.map(media => {
          // 处理封面 URL
          let cover = media.cover || '';
          if (cover) {
            if (cover.startsWith('//')) {
              cover = `https:${cover}`;
            } else if (!cover.startsWith('http')) {
              cover = `https:${cover}`;
            }
          }
          
          return {
            title: media.title || '无标题',
            cover: cover,
            bvid: media.bvid || '',
            author: media.upper?.name || '未知',
            duration: media.duration || 0,
            play: media.cnt_info?.play || 0,
            favorite: media.cnt_info?.collect || 0
          };
        });
        
        const favoritesData = {
          folderName: firstFolder.title || '默认收藏夹',
          folderId: mediaId,
          total: firstFolder.media_count || 0,
          items: favorites
        };
        
        // 存入缓存
        setCachedData('favorites', [favoritesData]);
        console.log(`[Bilibili API] 获取收藏夹: ${favoritesData.folderName} (${favorites.length} 个收藏)`);
        
        return [favoritesData];
      } else {
        console.warn('[Bilibili API] 获取收藏夹内容失败:', resourceListResponse.data?.message || '未知错误');
        const staleCache = getStaleCache('favorites');
        if (staleCache) {
          console.warn('[Bilibili API] API失败，降级使用旧缓存 (favorites)');
        }
        return staleCache || [];
      }
    } else {
      console.warn('[Bilibili API] 获取收藏夹列表失败:', folderListResponse.data?.message || '未知错误');
      const staleCache = getStaleCache('favorites');
      if (staleCache) {
        console.warn('[Bilibili API] API失败，降级使用旧缓存 (favorites)');
      }
      return staleCache || [];
    }
  } catch (error) {
    console.error('[Bilibili API] 获取收藏夹失败:', error.message);
    if (error.response) {
      console.error(`[Bilibili API] HTTP ${error.response.status}:`, error.response.data);
      
      // 检查是否是 -799 错误
      if (error.response?.data?.code === -799) {
        console.warn('[Bilibili API] 请求过于频繁 (-799)，使用缓存数据');
        const staleCache = getStaleCache('favorites');
        if (staleCache) {
          console.warn('[Bilibili API] API失败，降级使用旧缓存 (favorites)');
          return staleCache;
        }
      }
    }
    
    // 尝试返回缓存（降级使用过期缓存）
    const staleCache = getStaleCache('favorites');
    if (staleCache) {
      console.warn('[Bilibili API] API失败，降级使用旧缓存 (favorites)');
    }
    return staleCache || [];
  }
}

/**
 * 更新 Bilibili 数据（定时采集函数）
 * 获取所有数据并保存到本地 JSON 文件
 */
async function updateBilibiliData() {
  try {
    // 检查配置
    if (!BILIBILI_UID) {
      console.log('[Bilibili] 未配置 UID，跳过数据采集');
      return;
    }
    
    console.log('[Bilibili] 开始定时采集数据...');
    
    // 串行获取数据，避免请求过于频繁导致限流
    // 先获取用户信息
    const userInfo = await getBilibiliUserInfo(BILIBILI_UID, false); // 不使用缓存，强制获取最新数据
    
    // 等待500ms后获取统计数据
    await new Promise(resolve => setTimeout(resolve, 500));
    const userStats = await getBilibiliUserStats(BILIBILI_UID, false);
    
    // 等待500ms后获取视频列表
    await new Promise(resolve => setTimeout(resolve, 500));
    const videos = await getBilibiliVideos(BILIBILI_UID, false);
    
    // 等待500ms后获取收藏夹
    await new Promise(resolve => setTimeout(resolve, 500));
    const favorites = await getBilibiliFavorites(BILIBILI_UID, false);
    
    if (!userInfo) {
      console.warn(`[Bilibili] 无法获取用户信息 (UID: ${BILIBILI_UID})`);
      console.warn('[Bilibili] 请检查:');
      console.warn('  1. UID 是否正确');
      console.warn('  2. 网络连接是否正常');
      console.warn('  3. Bilibili API 是否可访问');
      // 不抛出错误，保留旧数据
      return;
    }
    
    // 合并用户信息和统计数据
    // 确保头像URL不为空字符串（保存原始 URL，不处理代理）
    const avatarUrl = userInfo.avatar && userInfo.avatar.trim() ? userInfo.avatar : null;
    
    const profileData = {
      uid: BILIBILI_UID, // 添加 UID，用于构建主页链接
      username: userInfo.username,
      avatar: avatarUrl || null, // 保存原始 URL，在 API 接口返回时处理代理
      bio: userInfo.bio || '',
      level: userInfo.level || 0,
      followers: (userStats?.followers || 0).toString(),
      following: (userStats?.following || 0).toString()
    };
    
    // 构建数据对象（保存原始 URL，不处理代理）
    const bilibiliData = {
      profile: profileData,
      latestVideos: videos.length > 0 ? videos : [
        { 
          title: '暂无视频', 
          thumbnail: 'https://images.unsplash.com/photo-1544197150-b99a580bbc7c?q=80&w=600&auto=format&fit=crop', 
          date: '-' 
        }
      ],
      favorites: favorites || []
    };
    
    // 保存到文件
    writeFileSync(bilibiliDataFile, JSON.stringify(bilibiliData, null, 2), 'utf-8');
    console.log('[Bilibili] 定时采集完成，数据已保存');
  } catch (error) {
    console.error('[Bilibili] 定时采集失败:', error.message);
    // 不抛出错误，保留旧数据
  }
}

// GET /api/status/bilibili - 返回 Bilibili 状态数据（从本地文件读取）
app.get('/api/status/bilibili', async (req, res) => {
  try {
    // 检查配置
    if (!BILIBILI_UID) {
      console.log('[Bilibili] 未配置 UID');
      return res.json({
        success: false,
        error: '未配置Bilibili UID',
        errorCode: 'NOT_CONFIGURED',
        message: '请在 config/platforms.json 中配置 bilibili.api.uid，或设置环境变量 BILIBILI_UID',
        timestamp: new Date().toISOString()
      });
    }
    
    // 检查本地数据文件是否存在
    if (!existsSync(bilibiliDataFile)) {
      console.log('[Bilibili] 数据文件不存在，返回初始化提示');
      return res.json({
        success: false,
        error: '数据初始化中...',
        errorCode: 'DATA_INITIALIZING',
        message: 'Bilibili 数据正在采集，请稍后再试',
        timestamp: new Date().toISOString()
      });
    }
    
    // 读取本地数据文件
    const bilibiliData = JSON.parse(readFileSync(bilibiliDataFile, 'utf-8'));
    
    // 处理图片代理 URL（在返回时处理，需要 baseUrl）
    const baseUrl = req.protocol + '://' + req.get('host');
    
    // 处理头像 URL
    let avatarUrl = bilibiliData.profile.avatar;
    if (avatarUrl && avatarUrl.includes('hdslb.com')) {
      avatarUrl = `${baseUrl}/api/proxy/image?url=${encodeURIComponent(avatarUrl)}`;
    }
    
    // 处理视频缩略图URL（通过代理）
    const processedVideos = bilibiliData.latestVideos.map(video => {
      if (video.thumbnail && video.thumbnail.includes('hdslb.com')) {
        return {
          ...video,
          thumbnail: `${baseUrl}/api/proxy/image?url=${encodeURIComponent(video.thumbnail)}`
        };
      }
      return video;
    });
    
    // 处理收藏夹封面URL（通过代理）
    const processedFavorites = bilibiliData.favorites.map(folder => ({
      ...folder,
      items: folder.items.map(item => {
        if (item.cover && item.cover.includes('hdslb.com')) {
          return {
            ...item,
            cover: `${baseUrl}/api/proxy/image?url=${encodeURIComponent(item.cover)}`
          };
        }
        return item;
      })
    }));
    
    // 构建响应数据（使用处理后的 URL）
    const responseData = {
      profile: {
        ...bilibiliData.profile,
        avatar: avatarUrl || null
      },
      latestVideos: processedVideos,
      favorites: processedFavorites
    };
    
    res.json({
      success: true,
      data: responseData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Bilibili] 接口错误:', error);
    res.status(500).json({
      success: false,
      error: error.message || '服务器内部错误',
      errorCode: 'SERVER_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/proxy/image - 代理图片请求（用于解决CORS问题）
app.get('/api/proxy/image', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    
    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: '缺少图片URL参数'
      });
    }
    
    // 验证URL格式
    try {
      new URL(imageUrl);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: '无效的URL格式'
      });
    }
    
    // 只允许Bilibili的图片域名
    const allowedDomains = ['i0.hdslb.com', 'i1.hdslb.com', 'i2.hdslb.com'];
    const urlObj = new URL(imageUrl);
    if (!allowedDomains.includes(urlObj.hostname)) {
      return res.status(403).json({
        success: false,
        error: '不允许的图片域名'
      });
    }
    
    // 代理请求图片
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': FIXED_USER_AGENT,
        'Referer': 'https://www.bilibili.com/'
      },
      timeout: 10000
    });
    
    // 设置响应头
    res.set({
      'Content-Type': response.headers['content-type'] || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400', // 缓存1天
      'Access-Control-Allow-Origin': '*'
    });
    
    res.send(Buffer.from(response.data));
  } catch (error) {
    console.error('[图片代理] 请求失败:', error.message);
    res.status(500).json({
      success: false,
      error: '图片代理请求失败'
    });
  }
});

// 天气API调用函数

// 获取访客IP地址
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         '127.0.0.1';
}

// 通过IP获取地理位置（使用免费IP定位服务）
async function getLocationByIp(ip) {
  try {
    // 跳过本地IP
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
      return null;
    }
    
    // 使用 ip-api.com 免费服务
    const response = await axios.get(`http://ip-api.com/json/${ip}?lang=zh-CN`, {
      timeout: 5000
    });
    
    if (response.data && response.data.status === 'success') {
      return {
        city: response.data.city,
        country: response.data.country,
        lat: response.data.lat,
        lon: response.data.lon
      };
    }
  } catch (error) {
    console.warn('[天气] IP定位失败:', error.message);
  }
  return null;
}

// 天气条件映射（英文到中文）
// 天气错误类
class WeatherError extends Error {
  constructor(message, errorCode) {
    super(message);
    this.name = 'WeatherError';
    this.errorCode = errorCode;
  }
}

// 调用和风天气 API
async function getWeatherFromQWeather(city, lat, lon) {
  if (!WEATHER_QW_API_KEY) {
    throw new WeatherError('未配置和风天气 API Key', 'API_NOT_CONFIGURED');
  }
  
  let location = city;
  
  // 如果没有城市名称，使用经纬度
  if (!location && lat && lon) {
    // 先通过经纬度获取城市信息
    try {
      const geoResponse = await axios.get(`https://geoapi.qweather.com/v2/city/lookup`, {
        params: {
          location: `${lon},${lat}`,
          key: WEATHER_QW_API_KEY
        },
        timeout: 10000
      });
      
      if (geoResponse.data.code === '200' && geoResponse.data.location?.length > 0) {
        location = geoResponse.data.location[0].id;
      }
    } catch (error) {
      console.warn('[天气] 和风天气地理编码失败:', error.message);
    }
  }
  
  if (!location) {
    throw new WeatherError('需要提供城市名称或经纬度', 'CITY_NOT_CONFIGURED');
  }
  
  try {
    // 获取当前天气
    const response = await axios.get(`https://devapi.qweather.com/v7/weather/now`, {
      params: {
        location: location,
        key: WEATHER_QW_API_KEY
      },
      timeout: 10000
    });
    
    const responseData = response.data;
    
    if (responseData.code !== '200') {
      // 检查错误代码
      if (responseData.code === '401' || responseData.code === '403') {
        throw new WeatherError('API Key 无效或已过期', 'CONFIG_ERROR');
      }
      if (responseData.code === '204') {
        throw new WeatherError('城市不存在或无法找到', 'CONFIG_ERROR');
      }
      throw new WeatherError(responseData.message || '获取天气数据失败', 'FETCH_ERROR');
    }
    
    const data = responseData.now;
    
    return {
      temp: parseInt(data.temp),
      condition: data.text,
      conditionZh: data.text,
      humidity: `${data.humidity}%`,
      wind: `${data.windScale}级`,
      feelsLike: parseInt(data.feelsLike),
      city: responseData.refer?.sources?.[0] || city,
      country: 'CN'
    };
  } catch (error) {
    // 如果已经是WeatherError，直接抛出
    if (error instanceof WeatherError) {
      throw error;
    }
    
    if (error.response) {
      const errorData = error.response.data;
      const statusCode = error.response.status;
      
      // 401/403 表示 API Key 无效
      if (statusCode === 401 || statusCode === 403) {
        throw new WeatherError('API Key 无效或已过期', 'CONFIG_ERROR');
      }
      
      throw new WeatherError(`和风天气 API错误: ${errorData?.message || error.message}`, 'FETCH_ERROR');
    }
    
    // 网络错误或其他错误
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new WeatherError('请求超时，请检查网络连接', 'FETCH_ERROR');
    }
    
    throw new WeatherError(error.message || '获取天气数据失败', 'FETCH_ERROR');
  }
}

// 获取天气数据（带缓存）
async function getWeatherData(req) {
  // 检查缓存
  const now = Date.now();
  if (weatherCache.data && (now - weatherCache.timestamp) < WEATHER_CACHE_DURATION) {
    console.log('[天气] 使用缓存数据');
    return weatherCache.data;
  }
  
  // 检查是否启用
  if (!WEATHER_ENABLED) {
    return MOCK_DATA.weather;
  }
  
  try {
    // 检查API Key配置
    if (!WEATHER_QW_API_KEY) {
      throw new WeatherError('未配置和风天气 API Key', 'API_NOT_CONFIGURED');
    }
    
    let city = WEATHER_QW_CITY;
    let lat = null;
    let lon = null;
    
    // 如果没有配置城市，尝试通过IP定位
    if (!city) {
      const clientIp = getClientIp(req);
      const location = await getLocationByIp(clientIp);
      if (location) {
        city = location.city;
        lat = location.lat;
        lon = location.lon;
      }
    }
    
    // 如果还是没有城市信息，抛出错误
    if (!city && !lat && !lon) {
      throw new WeatherError('未配置城市且无法通过IP定位', 'CITY_NOT_CONFIGURED');
    }
    
    // 调用和风天气API
    const weatherData = await getWeatherFromQWeather(city, lat, lon);
    
    // 更新缓存
    weatherCache.data = weatherData;
    weatherCache.timestamp = now;
    
    console.log(`[天气] 获取成功: ${weatherData.city} ${weatherData.temp}°C ${weatherData.conditionZh}`);
    return weatherData;
  } catch (error) {
    console.error('[天气] 获取失败:', error.message);
    
    // 如果是WeatherError，直接抛出（不降级）
    if (error instanceof WeatherError) {
      throw error;
    }
    
    // 其他错误，转换为FETCH_ERROR
    throw new WeatherError(error.message || '获取天气数据失败', 'FETCH_ERROR');
  }
}

// GET /api/status/weather - 返回天气数据
app.get('/api/status/weather', async (req, res) => {
  try {
    // 从查询参数中获取经纬度（浏览器定位）
    const lat = req.query.lat ? parseFloat(req.query.lat) : null;
    const lon = req.query.lon ? parseFloat(req.query.lon) : null;
    
    // 优先使用和风天气服务（如果配置了API Key和Location ID）
    // 配置优先级：环境变量 > platforms.json
    const qweatherApiKey = process.env.QWEATHER_KEY || WEATHER_QW_API_KEY;
    const ownerLocationId = process.env.OWNER_LOCATION_ID || PLATFORM_CONFIG?.weather?.api?.qweather?.ownerLocationId;
    const useQWeather = qweatherApiKey && ownerLocationId;
    
    if (useQWeather) {
      // 使用和风天气服务，传递经纬度参数（如果提供）
      const weatherData = await qweatherService.getWeatherData(req, lat, lon);
      
      // 转换数据格式以保持向后兼容
      // 如果前端需要旧格式，返回visitor（访客天气）或owner（站长天气）
      const primaryWeather = weatherData.visitor || weatherData.owner;
      
    res.json({
      success: true,
        data: {
          // 新格式：包含owner和visitor
          owner: weatherData.owner,
          visitor: weatherData.visitor,
          // 向后兼容：主要天气数据（优先访客，否则站长）
          ...(primaryWeather ? {
            temp: primaryWeather.temp,
            condition: primaryWeather.condition,
            conditionZh: primaryWeather.conditionZh,
            humidity: primaryWeather.humidity,
            wind: primaryWeather.wind,
            feelsLike: primaryWeather.feelsLike,
            city: primaryWeather.city || '未知',
            locationId: primaryWeather.locationId
          } : null)
        },
      timestamp: new Date().toISOString()
    });
    } else {
      // 使用原有的天气API逻辑
      const weatherData = await getWeatherData(req);
      res.json({
        success: true,
        data: weatherData,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    // 如果是WeatherError，返回详细的错误信息
    if (error instanceof WeatherError) {
      return res.json({
        success: false,
        error: error.message,
        errorCode: error.errorCode,
        timestamp: new Date().toISOString()
      });
    }
    
    // 其他错误
    res.status(500).json({
      success: false,
      error: error.message,
      errorCode: 'FETCH_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

// 辅助函数：将本地路径转换为URL
function convertToUrl(pathOrUrl, baseUrl) {
  if (!pathOrUrl) return null;
  
  // 如果已经是完整的URL，直接返回
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  
  // 如果是本地路径，转换为URL
  // 支持相对路径（相对于uploads目录）或绝对路径
  let filePath = pathOrUrl;
  
  // 如果是相对路径，假设在uploads目录下
  if (!filePath.startsWith('/') && !filePath.match(/^[A-Za-z]:/)) {
    filePath = join(uploadsDir, filePath);
  }
  
  // 检查文件是否存在
  if (existsSync(filePath)) {
    // 转换为相对于uploads目录的路径
    const relativePath = filePath.replace(uploadsDir, '').replace(/\\/g, '/');
    return `${baseUrl}/uploads${relativePath}`;
  }
  
  // 如果文件不存在，返回null（使用默认值）
  return null;
}

// GET /api/profile - 返回个人资料数据
app.get('/api/profile', (req, res) => {
  try {
    // 每次请求时重新读取配置文件，实现热重载
    try {
      if (existsSync(siteConfigPath)) {
        SITE_CONFIG = JSON.parse(readFileSync(siteConfigPath, 'utf-8'));
      }
    } catch (error) {
      console.warn('[配置] 重新加载网站配置文件失败，使用缓存的配置:', error.message);
    }
    
    // 从网站配置文件读取个人资料，如果没有则使用默认值
    const profileConfig = SITE_CONFIG?.profile || {};
    
    // 获取基础URL
    const baseUrl = req.protocol + '://' + req.get('host');
    
    // 处理头像：支持本地路径和URL
    let avatar = profileConfig.avatar || process.env.PROFILE_AVATAR || null;
    if (avatar) {
      const convertedAvatar = convertToUrl(avatar, baseUrl);
      if (convertedAvatar) {
        avatar = convertedAvatar;
      } else if (!avatar.startsWith('http://') && !avatar.startsWith('https://')) {
        // 如果转换失败且不是URL，使用默认值
        avatar = null;
      }
    }
    
    // 处理背景图片：支持本地路径和URL
    let bgImage = profileConfig.bgImage || process.env.PROFILE_BG_IMAGE || null;
    if (bgImage) {
      const convertedBgImage = convertToUrl(bgImage, baseUrl);
      if (convertedBgImage) {
        bgImage = convertedBgImage;
      } else if (!bgImage.startsWith('http://') && !bgImage.startsWith('https://')) {
        // 如果转换失败且不是URL，使用默认值
        bgImage = null;
      }
    }
    
    const profileData = {
      name: profileConfig.name || process.env.PROFILE_NAME || MOCK_DATA.profile.name || "User",
      avatar: avatar || MOCK_DATA.profile.avatar || "https://api.dicebear.com/9.x/avataaars/svg?seed=User&backgroundColor=ffdfbf",
      location: profileConfig.location || process.env.PROFILE_LOCATION || MOCK_DATA.profile.location || "City, Country",
      bgImage: bgImage || MOCK_DATA.profile.bgImage || "https://images.unsplash.com/photo-1518709414768-a88986a4555d?q=80&w=1200&auto=format&fit=crop"
    };
    
    // 返回网站配置（包括标题）
    const siteData = {
      title: SITE_CONFIG?.title || profileData.name || "小Rea的status",
      profile: profileData
    };
    
    res.json({
      success: true,
      data: siteData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || '服务器内部错误',
      errorCode: 'SERVER_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/profile/upload - 上传头像或背景图片
app.post('/api/profile/upload', upload.fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'bgImage', maxCount: 1 }
]), (req, res) => {
  try {
    const files = req.files;
    const result = {};
    
    if (files.avatar && files.avatar[0]) {
      const avatarFile = files.avatar[0];
      const relativePath = avatarFile.path.replace(uploadsDir, '').replace(/\\/g, '/');
      const baseUrl = req.protocol + '://' + req.get('host');
      result.avatar = {
        url: `${baseUrl}/uploads${relativePath}`,
        path: relativePath,
        filename: avatarFile.filename
      };
    }
    
    if (files.bgImage && files.bgImage[0]) {
      const bgImageFile = files.bgImage[0];
      const relativePath = bgImageFile.path.replace(uploadsDir, '').replace(/\\/g, '/');
      const baseUrl = req.protocol + '://' + req.get('host');
      result.bgImage = {
        url: `${baseUrl}/uploads${relativePath}`,
        path: relativePath,
        filename: bgImageFile.filename
      };
    }
    
    res.json({
      success: true,
      data: result,
      message: '文件上传成功',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || '文件上传失败',
      errorCode: 'UPLOAD_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

// PUT /api/profile - 更新个人资料配置
app.put('/api/profile', express.json(), (req, res) => {
  try {
    const { name, avatar, location, bgImage } = req.body;
    
    // 读取现有配置
    let config = {};
    if (existsSync(siteConfigPath)) {
      config = JSON.parse(readFileSync(siteConfigPath, 'utf-8'));
    }
    
    // 更新 profile 配置
    if (!config.profile) {
      config.profile = {};
    }
    
    if (name !== undefined) config.profile.name = name;
    if (avatar !== undefined) config.profile.avatar = avatar;
    if (location !== undefined) config.profile.location = location;
    if (bgImage !== undefined) config.profile.bgImage = bgImage;
    
    // 保存到文件
    writeFileSync(siteConfigPath, JSON.stringify(config, null, 2), 'utf-8');
    
    // 重新加载配置
    SITE_CONFIG = config;
    
    console.log('[配置] 个人资料配置已更新');
    
    res.json({
      success: true,
      data: config.profile,
      message: '个人资料配置已更新',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[配置] 更新个人资料配置失败:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || '更新配置失败',
      errorCode: 'UPDATE_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

// 加载设备状态数据（持久化）
function loadDeviceStatus() {
  try {
    if (existsSync(deviceStatusFile)) {
      const data = JSON.parse(readFileSync(deviceStatusFile, 'utf-8'));
      console.log('[设备状态] 从文件加载设备状态数据');
      return data;
    }
  } catch (error) {
    console.warn('[设备状态] 加载设备状态数据失败:', error.message);
  }
  
  // 如果文件不存在或加载失败，返回空对象
  return {};
}

// 保存设备状态数据（持久化）
function saveDeviceStatus() {
  try {
    writeFileSync(deviceStatusFile, JSON.stringify(deviceStatusCache, null, 2), 'utf-8');
  } catch (error) {
    console.error('[设备状态] 保存设备状态数据失败:', error);
  }
}

// 内存存储设备状态（从文件加载，支持持久化）
let deviceStatusCache = loadDeviceStatus();

// 格式化运行时间
function formatUptime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

// 设备归一化：仅区分 PC 和 Mobile，忽略具体 deviceId
function normalizeDevice(identity = {}) {
  const type = (identity.deviceType || '').toLowerCase() === 'mobile' ? 'mobile' : 'pc';
  const normalizedId = type === 'mobile' ? 'mobile' : 'pc';
  const normalizedName = identity.deviceName || (type === 'mobile' ? 'Mobile' : 'PC');
  return { normalizedId, normalizedType: type, normalizedName };
}

// POST /api/report/device - 接收设备状态上报
app.post('/api/report/device', (req, res) => {
  try {
    const deviceData = req.body;
    
    if (deviceData.type === 'status') {
      // 状态更新（按类型归一化设备）
      const { normalizedId: deviceId, normalizedType, normalizedName } = normalizeDevice(deviceData);
      const now = new Date();
      const today = getTodayDateString();

      const prevStatus = deviceStatusCache[deviceId];
      const prevDateStr = prevStatus?.lastUpdate ? prevStatus.lastUpdate.slice(0, 10) : today;

      // 今日在线时长（秒），默认从缓存读取
      let todayOnlineSeconds = prevStatus?.todayOnlineSeconds || 0;

      // 如果跨天，重置今日在线时长
      if (prevDateStr !== today) {
        todayOnlineSeconds = 0;
      }

      // 如果上一条状态是在线，则累加从上次上报到现在的时长
      const wasOnline = prevStatus && (prevStatus.status || 'online') !== 'offline';
      // 当前是否在线（用于判断是否继续累加）
      const isNowOnline = (deviceData.status || 'online') !== 'offline';
      
      // 只有当上一条状态是在线，且当前状态也是在线时，才累加时长
      // 如果当前状态是离线，不累加（停止计时）
      if (wasOnline && isNowOnline && prevStatus.lastUpdate) {
        const prevTime = new Date(prevStatus.lastUpdate);
        const deltaSeconds = Math.max(0, Math.floor((now - prevTime) / 1000));
        todayOnlineSeconds += deltaSeconds;
      }

      deviceStatusCache[deviceId] = {
        ...deviceData,
        deviceId,
        deviceType: normalizedType,
        deviceName: normalizedName,
        lastUpdate: now.toISOString(),
        // 将今日在线时长写入状态，供前端展示「今日运行时长」
        todayOnlineSeconds,
        // 兼容旧字段：uptime 使用今日在线时长
        uptime: todayOnlineSeconds
      };
      
      // 保存设备状态到文件（持久化）
      saveDeviceStatus();
      
      const currentAppName = deviceData.currentApp?.name || null;
      
      // 处理 duration 字段，更新今日应用使用时长统计
      if (currentAppName) {
        // 从 req.body.duration 获取时长，如果不存在或无效，默认回退到 10 秒
        let duration = deviceData.duration;
        
        // 验证 duration 是否有效
        if (typeof duration !== 'number' || isNaN(duration) || duration <= 0) {
          duration = 10; // 默认回退到 10 秒（兼容旧逻辑）
        }
        
        // 更新今日统计（用于 /api/stats/today）
        updateTodayStats(currentAppName, duration);

        // 额外记录 usageRecords，供 /api/usage/today 在手机端使用
        // PC 端已有 usageRecords 批量上报，这里只针对非 PC 设备补充
        if ((normalizedType && normalizedType !== 'pc') || (!normalizedType && deviceId !== 'pc')) {
          const durationMs = duration * 1000; // usageRecords 统一使用毫秒
          const nowISO = new Date(now).toISOString();
          usageRecords.push({
            id: `${deviceId}-${Date.now()}-${Math.random()}`,
            deviceId: deviceId,
            deviceType: normalizedType || 'mobile',
            appName: currentAppName,
            windowTitle: deviceData.currentApp?.title || deviceData.currentApp?.packageName || deviceData.currentApp?.windowTitle || null,
            startTime: new Date(now - durationMs).toISOString(),
            endTime: nowISO,
            duration: durationMs,
            timestamp: nowISO
          });
          
          // 清理并持久化，确保前端可读取
          cleanupOldRecords();
          saveUsageData(usageRecords);
        }
      }
      
      // 立即通过 WebSocket 广播给所有客户端
      broadcastDeviceStatus();
    } else if (deviceData.usageRecords) {
      // 使用记录批量上报
      
      // 保存使用记录
      deviceData.usageRecords.forEach(record => {
        const { normalizedId, normalizedType, normalizedName } = normalizeDevice({
          deviceType: record.deviceType,
          deviceId: record.deviceId,
          deviceName: record.deviceName
        });
        // 添加到内存数组
        usageRecords.push({
          id: normalizedId + '-' + Date.now() + '-' + Math.random(),
          deviceId: normalizedId,
          deviceType: normalizedType,
          deviceName: normalizedName,
          appName: record.appName,
          windowTitle: record.windowTitle,
          startTime: record.startTime,
          endTime: record.endTime,
          duration: record.duration,
          timestamp: record.timestamp || new Date().toISOString()
        });
      });
      
      // 使用统一的清理函数清理旧数据
      cleanupOldRecords();
    }
    
    // TODO: 后续可以在这里保存到数据库
    
    res.json({
      success: true,
      message: '设备数据接收成功',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[设备上报错误]', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/status/device - 获取设备状态（用于前端显示）
app.get('/api/status/device', (req, res) => {
  try {
    // 构建设备列表数据（与 broadcastDeviceStatus 保持一致）
    let devices = {};
    
    // 遍历缓存中的所有设备 (支持 PC 和 Mobile)
    Object.keys(deviceStatusCache).forEach(deviceId => {
      const status = deviceStatusCache[deviceId];
      const lastUpdate = new Date(status.lastUpdate);
      const now = new Date();
      const secondsSinceUpdate = (now - lastUpdate) / 1000;
      
      // 判断是否在线 (超过 30 秒未上报视为离线)
      const isOnline = secondsSinceUpdate <= 30;

      // 今日在线时长（秒），兼容旧字段
      const todayOnlineSeconds = typeof status.todayOnlineSeconds === 'number'
        ? status.todayOnlineSeconds
        : (typeof status.uptime === 'number' ? status.uptime : 0);
      
      devices[deviceId] = {
        id: status.deviceId || deviceId,
        name: status.deviceName || (deviceId === 'pc' ? "Workstation" : "Mobile"),
        type: status.deviceType || (deviceId === 'pc' ? 'pc' : 'mobile'),
        os: status.deviceOS || (deviceId === 'pc' ? "Windows 11" : "Android"),
        status: isOnline ? (status.status || "online") : "offline",
        
        // 手机特有字段
        battery: status.battery, 
        isCharging: status.isCharging, 
        networkType: status.networkType, 
        
        todayOnlineSeconds,
        uptime: formatUptime(todayOnlineSeconds),
        currentApp: status.currentApp || { name: "Unknown", icon: deviceId === 'pc' ? "💻" : "📱" },
        lastUpdate: status.lastUpdate,
        todayStats: status.todayStats || []
      };
    });
    
    // 如果没有任何数据，提供默认 PC 占位
    if (Object.keys(devices).length === 0) {
      devices['pc'] = {
            id: 'pc',
            name: "Workstation",
        type: 'pc',
            os: "Windows 11",
            status: "offline",
            currentApp: { name: "Unknown", icon: "💻" }
      };
    }
    
    // 获取最新的 lastUpdate（用于前端显示同步时间）
    const allLastUpdates = Object.values(devices)
      .map(device => device.lastUpdate)
      .filter(update => update)
      .map(update => new Date(update).getTime());
    const latestLastUpdate = allLastUpdates.length > 0 
      ? new Date(Math.max(...allLastUpdates)).toISOString()
      : null;
    
    res.json({
      success: true,
      data: devices,
        timestamp: new Date().toISOString(),
      lastUpdate: latestLastUpdate  // 返回最新的设备更新时间
      });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/stats/today - 获取今日应用使用时长排行
app.get('/api/stats/today', (req, res) => {
  try {
    // 加载今日统计数据
    const stats = loadTodayStats();
    const today = getTodayDateString();
    
    // 如果日期变了，返回空数组
    if (stats.date !== today) {
      return res.json({
        success: true,
        data: [],
        totalDuration: 0,
        date: today,
        timestamp: new Date().toISOString()
      });
    }
    
    // 将 apps 对象转换为数组
    const appsArray = Object.entries(stats.apps || {})
      .map(([name, duration]) => ({
        name: name,
        duration: parseFloat(duration.toFixed(2)) // 保留 2 位小数
      }))
      .filter(app => app.duration > 0); // 过滤掉时长为 0 的应用
    
    // 计算总时长
    const totalDuration = appsArray.reduce((sum, app) => sum + app.duration, 0);
    
    // 按 duration 从大到小排序
    appsArray.sort((a, b) => b.duration - a.duration);
    
    // 只返回前 10 名
    const topApps = appsArray.slice(0, 10);
    
    // 计算百分比
    topApps.forEach(app => {
      app.percent = totalDuration > 0 ? Math.round((app.duration / totalDuration) * 100) : 0;
    });
    
    res.json({
      success: true,
      data: topApps,
      totalDuration: parseFloat(totalDuration.toFixed(2)),
      date: today,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[统计] 获取今日排行失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/usage/today - 获取今日应用使用统计
app.get('/api/usage/today', (req, res) => {
  try {
    const deviceType = req.query.deviceType || 'pc';
    const deviceId = req.query.deviceId;
    
    // 获取北京时间今日开始时间（UTC+8）
    const todayStart = getBeijingTodayStart();
    
    // 筛选今日记录
    const todayRecords = usageRecords.filter(record => {
      const recordTime = new Date(record.timestamp).getTime();
      const matchesDevice = deviceId 
        ? record.deviceId === deviceId 
        : record.deviceType === deviceType;
      return matchesDevice && recordTime >= todayStart;
    });
    
    // 按应用名称聚合统计
    const appStats = {};
    todayRecords.forEach(record => {
      const appName = record.appName;
      if (!appStats[appName]) {
        appStats[appName] = {
          name: appName,
          totalDuration: 0,
          count: 0,
          windowTitles: new Set()
        };
      }
      appStats[appName].totalDuration += record.duration || 0;
      appStats[appName].count += 1;
      if (record.windowTitle) {
        appStats[appName].windowTitles.add(record.windowTitle);
      }
    });
    
    // 转换为数组并排序
    const statsArray = Object.values(appStats)
      .map(stat => ({
        name: stat.name,
        time: formatDuration(stat.totalDuration),
        duration: stat.totalDuration, // 用于排序和计算百分比
        count: stat.count,
        icon: '💻', // 默认图标，后续可以扩展图标映射
        category: 'Unknown' // 默认分类，后续可以扩展分类映射
      }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10); // Top 10
    
    // 计算百分比
    const totalDuration = statsArray.reduce((sum, stat) => sum + stat.duration, 0);
    statsArray.forEach(stat => {
      stat.percent = totalDuration > 0 ? Math.round((stat.duration / totalDuration) * 100) : 0;
    });
    
    res.json({
      success: true,
      data: statsArray,
      totalDuration: formatDuration(totalDuration),
      recordCount: todayRecords.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[获取使用统计失败]', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 格式化时长（用于 API 响应）
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

// SPA 路由回退：在所有 API 路由之后处理前端 History 路由
if (existsSync(distPath)) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/ws')) {
      return next();
    }
    res.sendFile(join(distPath, 'index.html'));
  });
}

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '接口不存在',
    path: req.path
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('[服务器错误]', err);
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
    message: err.message
  });
});

// ================= 控制台仪表盘系统 =================

// 1. 状态栏渲染函数
function renderDashboard() {
  // 获取 PC 和 手机 数据
  const pc = deviceStatusCache['pc'] || {};
  // 查找手机 (排除 pc)
  const mobileKey = Object.keys(deviceStatusCache).find(k => k !== 'pc');
  const mobile = mobileKey ? deviceStatusCache[mobileKey] : {};

  // 辅助函数：计算状态文本和图标
  const getStatusInfo = (device) => {
    if (!device.lastUpdate) return { icon: '⚪', text: 'Waiting...' };
    
    const diff = (new Date() - new Date(device.lastUpdate)) / 1000;
    
    // 逻辑要与 broadcastDeviceStatus 保持一致
    if (device.status === 'sleep' && diff < 24 * 3600) return { icon: '🌙', text: 'Sleep  ' };
    if (diff > 60) return { icon: '🔴', text: 'Offline' };
    return { icon: '🟢', text: 'Online ' };
  };

  const pcStatus = getStatusInfo(pc);
  const mobStatus = getStatusInfo(mobile);

  // 格式化输出行 (使用 padEnd 对齐)
  // PC 行
  const pcLine = `[🖥️ PC    ] ${pcStatus.icon} ${pcStatus.text} | ${pc.deviceOS || '--'} | App: ${pc.currentApp?.name || '--'}`;
  
  // 手机 行
  const batteryStr = mobile.battery ? `🔋${mobile.battery}%` : '     ';
  const mobLine = `[📱 Mobile] ${mobStatus.icon} ${mobStatus.text} | ${batteryStr} | App: ${mobile.currentApp?.name || '--'}`;

  // === ANSI 魔术：移动光标并重绘 ===
  // \x1b[2K 清除当前行
  // \x1b[1000D 光标归位到行首
  // \x1b[1A 光标上移一行
  
  // 这里的逻辑是：先上移一行，清除，打印PC；然后换行，清除，打印手机
  // 为了防止光标乱跑，我们先假设光标在最后一行，然后重绘最后两行
  
  process.stdout.write(`\x1b[2K\x1b[1000D`); // 清除第二行(手机)
  process.stdout.write(`\x1b[1A\x1b[2K\x1b[1000D`); // 上移并清除第一行(PC)
  
  originalLog(pcLine); // 打印 PC (会自动换行，不触发拦截)
  process.stdout.write(mobLine); // 打印 手机 (不换行，保持在最后)
}

// 2. 启动定时刷新 (每秒刷新一次，确保能自动显示 Offline)
// 只有当有设备数据时才启动，或者直接启动
setInterval(() => {
  // 只有当控制台不为空时才刷新，避免启动时的闪烁
  if (Object.keys(deviceStatusCache).length > 0) {
    renderDashboard();
  }
}, 1000);

// 3. (可选) 拦截 console.log 以防止日志冲刷
// 这是一个高级技巧：在打印普通日志前，先清除底部的仪表盘，打印完再重绘
const originalLog = console.log;
const originalError = console.error;

function safeLog(type, args) {
  // 清除底部的两行仪表盘
  process.stdout.write(`\x1b[2K\x1b[1000D`); 
  process.stdout.write(`\x1b[1A\x1b[2K\x1b[1000D`);
  
  // 调用原始日志函数
  if (type === 'log') originalLog.apply(console, args);
  else originalError.apply(console, args);
  
  // 补两行空行，把位置占回来，以便下一次 renderDashboard 覆盖
  originalLog(''); 
  process.stdout.write(''); 
  
  // 立即重绘仪表盘
  if (Object.keys(deviceStatusCache).length > 0) {
      renderDashboard();
  }
}

// 覆盖系统日志函数
console.log = (...args) => safeLog('log', args);
console.error = (...args) => safeLog('error', args);

// ===============================================

// 设置 Bilibili 定时采集任务（每小时执行一次）
if (BILIBILI_UID) {
  // 立即执行一次（后台执行，不阻塞启动）
  updateBilibiliData().catch(err => {
    console.error('[Bilibili] 启动时采集失败:', err.message);
  });
  
  // 设置定时任务：每小时执行一次
  setInterval(() => {
    updateBilibiliData().catch(err => {
      console.error('[Bilibili] 定时采集失败:', err.message);
    });
  }, 60 * 60 * 1000); // 1小时 = 60 * 60 * 1000 毫秒
  
  console.log('[Bilibili] 定时采集任务已启动（每小时执行一次）');
}

// 启动服务器
server.listen(PORT, HOST, () => {
  const localUrl = `http://localhost:${PORT}`;
  const networkUrl = HOST === '0.0.0.0' ? `http://[本机IP]:${PORT}` : `http://${HOST}:${PORT}`;
  console.log(`🚀 服务器运行在 ${localUrl}`);
  if (HOST === '0.0.0.0') {
    console.log(`🌐 网络访问: ${networkUrl} (请将 [本机IP] 替换为实际IP地址)`);
  }
  console.log(`🔌 WebSocket 服务: ws://${HOST === '0.0.0.0' ? '[本机IP]' : HOST}:${PORT}/ws`);
  console.log(`📡 API 接口:`);
  console.log(`   GET  /api/health`);
  console.log(`   GET  /api/status/steam`);
  console.log(`   GET  /api/status/bilibili`);
  console.log(`   GET  /api/status/weather`);
  console.log(`   GET  /api/status/device`);
  console.log(`   POST /api/report/device`);
  console.log('');
  if (API_KEY) {
    if (REQUIRE_API_KEY !== false) {
      console.log(`🔐 API 密钥验证: 已启用（强制要求）`);
      console.log(`   密钥长度: ${API_KEY.length} 字符`);
      console.log(`   所有设备上报请求必须提供正确的密钥`);
    } else {
      console.log(`🔐 API 密钥: 已配置但验证已禁用（仅开发环境）`);
    }
  } else {
    console.log(`❌ API 密钥: 未配置 - 所有设备上报请求将被拒绝！`);
    console.log(`   请在 .env 文件中配置 API_KEY`);
  }
});

