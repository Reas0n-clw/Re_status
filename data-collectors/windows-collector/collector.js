import activeWin from 'active-win';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import os from 'os';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Always load .env next to the script so it works no matter where we launch from
dotenv.config({ path: join(__dirname, '.env') });

// 配置
const CONFIG = {
  // API 配置
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  apiKey: process.env.API_KEY || null, // API 密钥（可选）
  
  // 采集配置
  pollInterval: parseInt(process.env.POLL_INTERVAL || '2000'), // 轮询间隔（毫秒）
  uploadInterval: parseInt(process.env.UPLOAD_INTERVAL || '60000'), // 上传间隔（毫秒，60秒）
  minUsageTime: parseInt(process.env.MIN_USAGE_TIME || '5000'), // 最小使用时长（毫秒，5秒）
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '30000'), // 心跳间隔（毫秒，30秒）
  
  // 数据保留配置
  dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS || '7'), // 数据保留天数（默认7天）
  maxRecords: parseInt(process.env.MAX_RECORDS || '1000'), // 最大保留记录数（默认1000条）
  
  // 数据文件配置
  dataDir: join(__dirname, 'data'),
  usageFile: join(__dirname, 'data', 'usage.json'),
  
  // 设备信息
  deviceId: process.env.DEVICE_ID || `PC-${os.hostname()}`,
  deviceType: 'pc',
  deviceName: process.env.DEVICE_NAME || os.hostname(),
  deviceOS: `${os.type()} ${os.release()}`
};

// 确保数据目录存在
if (!existsSync(CONFIG.dataDir)) {
  mkdirSync(CONFIG.dataDir, { recursive: true });
}

// 内存数据存储
let usageRecords = [];
let todayStats = {}; // 今日统计 { appName: { totalDuration, count } }

// 加载本地数据
function loadLocalData() {
  try {
    if (existsSync(CONFIG.usageFile)) {
      const data = JSON.parse(readFileSync(CONFIG.usageFile, 'utf-8'));
      usageRecords = data.records || [];
      todayStats = data.todayStats || {};
      console.log(`[数据加载] 已加载 ${usageRecords.length} 条记录`);
    }
  } catch (error) {
    console.warn('[数据加载失败]', error.message);
    usageRecords = [];
    todayStats = {};
  }
}

// 保存本地数据
function saveLocalData() {
  try {
    const data = {
      records: usageRecords,
      todayStats: todayStats,
      lastSave: new Date().toISOString()
    };
    writeFileSync(CONFIG.usageFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[数据保存失败]', error);
  }
}

// 清理超过保留期的旧数据
function cleanupOldRecords() {
  const retentionTimestamp = Date.now() - CONFIG.dataRetentionDays * 24 * 60 * 60 * 1000;
  
  const beforeCount = usageRecords.length;
  
  // 过滤：只保留保留期内的记录（未上传的记录或上传时间在保留期内的记录）
  let filteredRecords = usageRecords.filter(r => {
    if (r.uploadStatus === 'pending') {
      // 未上传的记录保留
      return r.createdAt >= retentionTimestamp;
    } else {
      // 已上传的记录，根据上传时间判断
      return r.uploadTime && r.uploadTime >= retentionTimestamp;
    }
  });
  
  // 如果记录太多，只保留最近的记录
  if (filteredRecords.length > CONFIG.maxRecords) {
    filteredRecords = filteredRecords
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .slice(-CONFIG.maxRecords);
  }
  
  usageRecords = filteredRecords;
  
  const deletedCount = beforeCount - usageRecords.length;
  if (deletedCount > 0) {
    console.log(`[数据清理] 已清理 ${deletedCount} 条超过 ${CONFIG.dataRetentionDays} 天的旧记录，保留 ${usageRecords.length} 条记录`);
  }
  
  return deletedCount;
}

// 当前状态
let currentApp = null;
let currentStartTime = null;
let lastUploadTime = Date.now();
let lastReportedApp = null; // 上次上报的应用名称（用于避免重复上报）
let lastStatusReportTime = Date.now(); // 上次状态上报的时间戳（用于心跳机制）
let lastStatusUploadTime = Date.now() / 1000; // 上次状态上报的时间戳（秒，用于计算duration）

/**
 * 获取当前活动窗口信息
 */
async function getCurrentWindow() {
  try {
    const window = await activeWin();
    if (!window) return null;
    
    return {
      app: window.owner?.name || window.app || 'Unknown',
      title: window.title || '',
      processId: window.processId
    };
  } catch (error) {
    console.error('[获取窗口信息失败]', error.message);
    return null;
  }
}

/**
 * 记录应用使用
 */
function recordAppUsage(appName, windowTitle, startTime, endTime) {
  const duration = endTime - startTime;
  
  // 如果使用时长太短，不记录
  if (duration < CONFIG.minUsageTime) {
    return;
  }
  
  const record = {
    id: Date.now() + Math.random(),
    deviceId: CONFIG.deviceId,
    appName: appName,
    windowTitle: windowTitle,
    startTime: startTime,
    endTime: endTime,
    duration: duration,
    uploadStatus: 'pending',
    createdAt: Date.now()
  };
  
  usageRecords.push(record);
  
  // 更新今日统计
  if (!todayStats[appName]) {
    todayStats[appName] = { totalDuration: 0, count: 0 };
  }
  todayStats[appName].totalDuration += duration;
  todayStats[appName].count += 1;
  
  // 定期保存（每10条记录保存一次）
  if (usageRecords.length % 10 === 0) {
    saveLocalData();
  }
  
  console.log(`[记录] ${appName} - ${Math.round(duration / 1000)}秒`);
}

/**
 * 上传数据到服务器
 */
async function uploadData() {
  try {
    // 获取未上传的数据（最多50条）
    const pendingRecords = usageRecords
      .filter(r => r.uploadStatus === 'pending')
      .slice(0, 50);
    
    if (pendingRecords.length === 0) {
      return;
    }
    
    // 转换为API格式
    const usageData = pendingRecords.map(record => ({
      deviceId: record.deviceId,
      deviceType: CONFIG.deviceType,
      deviceName: CONFIG.deviceName,
      deviceOS: CONFIG.deviceOS,
      appName: record.appName,
      windowTitle: record.windowTitle,
      startTime: new Date(record.startTime).toISOString(),
      endTime: record.endTime ? new Date(record.endTime).toISOString() : null,
      duration: record.duration,
      timestamp: new Date(record.createdAt).toISOString()
    }));
    
    // 构建请求头
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // 如果配置了API密钥，添加到请求头
    if (CONFIG.apiKey) {
      headers['X-API-Key'] = CONFIG.apiKey;
    }
    
    // 发送到服务器
    const response = await fetch(`${CONFIG.apiBaseUrl}/api/report/device`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        deviceType: CONFIG.deviceType,
        deviceId: CONFIG.deviceId,
        deviceName: CONFIG.deviceName,
        deviceOS: CONFIG.deviceOS,
        usageRecords: usageData
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      // 标记为已上传
      pendingRecords.forEach(record => {
        record.uploadStatus = 'uploaded';
        record.uploadTime = Date.now();
      });
      
      // 使用统一的清理函数清理旧数据
      cleanupOldRecords();
      
      saveLocalData();
      
      console.log(`[上传成功] ${pendingRecords.length} 条记录`);
      lastUploadTime = Date.now();
    } else {
      throw new Error(result.error || '上传失败');
    }
  } catch (error) {
    console.error('[上传失败]', error.message);
    // 失败时不更新状态，下次重试
  }
}

/**
 * 获取今日使用统计（用于上报当前状态）
 */
function getTodayStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  
  // 从内存统计中获取
  const stats = Object.entries(todayStats)
    .map(([appName, stat]) => ({
      app_name: appName,
      total_duration: stat.totalDuration,
      usage_count: stat.count
    }))
    .filter(stat => {
      // 只返回今天有活动的应用
      const recentRecord = usageRecords
        .filter(r => r.appName === stat.app_name && r.startTime >= todayStart)
        .sort((a, b) => b.startTime - a.startTime)[0];
      return recentRecord !== undefined;
    })
    .sort((a, b) => b.total_duration - a.total_duration)
    .slice(0, 10);
  
  return stats;
}

/**
 * 上报当前设备状态
 */
async function reportDeviceStatus(force = false) {
  try {
    const stats = getTodayStats();
    const currentWindow = await getCurrentWindow();
    const currentAppName = currentWindow?.app || null;
    
    // 如果应用没有变化，且不是强制上报，跳过（避免重复上报）
    if (!force && currentAppName === lastReportedApp) {
      return;
    }
    
    // 计算 duration：当前时间与上次上报的差值（秒）
    const currentTime = Date.now() / 1000; // 转换为秒
    let duration = currentTime - lastStatusUploadTime;
    
    // 异常处理：如果 duration > 300 秒（例如电脑刚从休眠唤醒），重置为 1 秒
    if (duration > 300) {
      console.warn(`[状态上报] 检测到异常时长 ${duration.toFixed(2)} 秒，重置为 1 秒（可能是系统休眠）`);
      duration = 1;
    }
    
    // 确保 duration 不为负数（防止时间倒退）
    if (duration < 0) {
      duration = 0;
    }
    
    const statusData = {
      deviceType: CONFIG.deviceType,
      deviceId: CONFIG.deviceId,
      deviceName: CONFIG.deviceName,
      deviceOS: CONFIG.deviceOS,
      status: 'online',
      currentApp: currentWindow ? {
        name: currentWindow.app,
        title: currentWindow.title,
        icon: '💻' // 可以后续扩展图标映射
      } : null,
      uptime: process.uptime(),
      duration: parseFloat(duration.toFixed(2)), // 保留 2 位小数
      todayStats: stats.map(s => ({
        name: s.app_name,
        time: formatDuration(s.total_duration),
        percent: 0, // 可以计算百分比
        icon: '💻'
      }))
    };
    
    // 构建请求头
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // 如果配置了API密钥，添加到请求头
    if (CONFIG.apiKey) {
      headers['X-API-Key'] = CONFIG.apiKey;
    }
    
    // 发送状态更新
    const response = await fetch(`${CONFIG.apiBaseUrl}/api/report/device`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        ...statusData,
        type: 'status' // 标识这是状态更新
      })
    });
    
    // 无论成功失败，都更新 lastStatusUploadTime（为下一次计算做准备）
    lastStatusUploadTime = currentTime;
    
    if (response.ok) {
      lastReportedApp = currentAppName;
      lastStatusReportTime = Date.now(); // 更新上次状态上报时间（用于心跳机制）
      console.log(`[状态上报成功] ${currentWindow?.app || '无活动窗口'} (duration: ${duration.toFixed(2)}s)`);
    } else {
      const errorText = await response.text().catch(() => '');
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        if (errorText) {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error) {
            errorMessage = errorJson.error;
            if (errorJson.hint) {
              errorMessage += ` (${errorJson.hint})`;
            }
          }
        }
      } catch (e) {
        // 忽略 JSON 解析错误
      }
      throw new Error(errorMessage);
    }
  } catch (error) {
    console.error('[状态上报失败]', error.message);
    // 如果是密钥相关错误，给出更明确的提示
    if (error.message.includes('密钥') || error.message.includes('401') || error.message.includes('403')) {
      console.error('   提示: 请检查 .env 文件中的 API_KEY 是否与后端配置一致');
    }
  }
}

/**
 * 格式化时长
 */
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

/**
 * 主循环
 */
async function main() {
  console.log('🚀 Windows 数据采集客户端启动');
  console.log(`📡 API 地址: ${CONFIG.apiBaseUrl}`);
  if (CONFIG.apiKey) {
    console.log(`🔑 API 密钥: 已配置 (${CONFIG.apiKey.substring(0, 8)}...)`);
  } else {
    console.log(`❌ API 密钥: 未配置 - 数据将无法上传！`);
    console.log(`   请在 .env 文件中配置 API_KEY`);
    console.log(`   密钥必须与后端配置的 API_KEY 完全一致`);
  }
  console.log(`🖥️  设备ID: ${CONFIG.deviceId}`);
  console.log(`⏱️  轮询间隔: ${CONFIG.pollInterval}ms`);
  console.log(`📤 上传间隔: ${CONFIG.uploadInterval}ms`);
  console.log(`💓 心跳间隔: ${CONFIG.heartbeatInterval}ms (${CONFIG.heartbeatInterval / 1000}秒)`);
  console.log(`🗑️  数据保留: ${CONFIG.dataRetentionDays} 天，最多 ${CONFIG.maxRecords} 条记录`);
  console.log('');
  
  // 如果未配置密钥，警告但不退出（允许用户先配置）
  if (!CONFIG.apiKey) {
    console.log('⚠️  警告: 未配置 API_KEY，所有数据上传将失败');
    console.log('   请配置后重启采集器');
  }
  
  // 加载本地数据
  loadLocalData();
  
  // 启动时执行一次数据清理
  cleanupOldRecords();
  
  // 启动时立即上报一次状态
  await reportDeviceStatus(true);
  lastStatusReportTime = Date.now(); // 初始化上次状态上报时间（用于心跳机制）
  lastStatusUploadTime = Date.now() / 1000; // 初始化上次状态上报时间（用于计算duration）
  
  // 主循环：监听应用切换 + 心跳机制
  setInterval(async () => {
    const window = await getCurrentWindow();
    
    if (!window) {
      return;
    }
    
    const now = Date.now();
    const appKey = `${window.app}|${window.title}`;
    const timeSinceLastReport = now - lastStatusReportTime;
    
    // 条件A: 窗口变化了（立即更新）
    const windowChanged = currentApp !== appKey;
    
    // 条件B: 距离上次上报超过了心跳间隔（强制心跳）
    const heartbeatNeeded = timeSinceLastReport > CONFIG.heartbeatInterval;
    
    // 如果应用切换了
    if (windowChanged) {
      // 记录上一个应用的使用时长
      if (currentApp && currentStartTime) {
        const prevWindow = currentApp.split('|');
        recordAppUsage(prevWindow[0], prevWindow[1], currentStartTime, now);
      }
      
      // 开始记录新应用
      currentApp = appKey;
      currentStartTime = now;
      
      // 应用切换时立即上报状态（强制上报）
      await reportDeviceStatus(true);
    } else if (heartbeatNeeded) {
      // 窗口没变化，但需要心跳（强制上报）
      await reportDeviceStatus(true);
      console.log(`[心跳上报] 距离上次上报已超过 ${Math.round(timeSinceLastReport / 1000)} 秒`);
    }
  }, CONFIG.pollInterval);
  
  // 定期上传数据
  setInterval(async () => {
    await uploadData();
  }, CONFIG.uploadInterval);
  
  // 注意：主循环已经实现了心跳机制，这里不再需要定期上报
  // 心跳机制会在窗口变化或超过30秒时自动上报，确保设备始终在线
  
  // 每日清理旧数据（每天凌晨执行）
  function scheduleDailyCleanup() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      cleanupOldRecords();
      saveLocalData();
      // 安排下一次清理任务（24小时后）
      scheduleDailyCleanup();
    }, msUntilMidnight);
  }
  
  // 启动每日清理任务
  scheduleDailyCleanup();
  
  // 优雅退出
  process.on('SIGINT', async () => {
    console.log('\n正在保存数据...');
    
    // 保存当前应用的使用记录
    if (currentApp && currentStartTime) {
      const window = currentApp.split('|');
      recordAppUsage(window[0], window[1], currentStartTime, Date.now());
    }
    
    // 保存所有数据
    saveLocalData();
    
    // 尝试上传剩余数据
    await uploadData();
    
    console.log('数据已保存，程序退出');
    process.exit(0);
  });
  
  // 定期保存数据（每5分钟）
  setInterval(() => {
    saveLocalData();
  }, 5 * 60 * 1000);
}

// 启动
main().catch(console.error);

