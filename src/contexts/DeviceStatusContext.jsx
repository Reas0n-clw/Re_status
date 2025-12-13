import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { getApiBaseUrl, getWebSocketUrl } from '../utils/api';

// 创建 Context
const DeviceStatusContext = createContext(null);

// 全局 WebSocket 连接管理（单例模式）
let globalWS = null;
let globalWSData = null;
let globalWSLoading = true;
let globalWSError = null;
let globalWSConnected = false;
let globalWSFallback = false;
let globalStateSetters = null; // 存储所有 Provider 的状态更新函数
let globalLastUpdate = null; // 最后一次数据采集时间

/**
 * 设备状态 Context Provider
 * 在 App 层级管理 WebSocket 连接，所有子组件共享
 */
// 全局变量：是否已初始化
let isInitialized = false;

export const DeviceStatusProvider = ({ children }) => {
  const [data, setData] = useState(globalWSData);
  const [loading, setLoading] = useState(globalWSLoading);
  const [error, setError] = useState(globalWSError);
  const [isConnected, setIsConnected] = useState(globalWSConnected);
  const [isUsingFallback, setIsUsingFallback] = useState(globalWSFallback);
  const [lastUpdate, setLastUpdate] = useState(globalLastUpdate);
  
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  // 动态获取 API Base URL（自动适配当前访问地址）
  const apiBaseUrl = getApiBaseUrl();
  // 动态获取 WebSocket URL
  const wsUrl = getWebSocketUrl();
  const isInitializedRef = useRef(false);

  // 更新全局状态并通知组件
  const updateState = (updates) => {
    if (updates.data !== undefined) globalWSData = updates.data;
    if (updates.loading !== undefined) globalWSLoading = updates.loading;
    if (updates.error !== undefined) globalWSError = updates.error;
    if (updates.isConnected !== undefined) globalWSConnected = updates.isConnected;
    if (updates.isUsingFallback !== undefined) globalWSFallback = updates.isUsingFallback;
    if (updates.lastUpdate !== undefined) globalLastUpdate = updates.lastUpdate;
    
    // 更新本地状态（React 会自动通知所有使用 Context 的组件）
    setData(globalWSData);
    setLoading(globalWSLoading);
    setError(globalWSError);
    setIsConnected(globalWSConnected);
    setIsUsingFallback(globalWSFallback);
    setLastUpdate(globalLastUpdate);
  };

  // 降级到轮询模式
  const fallbackToPolling = async () => {
    updateState({ isUsingFallback: true, isConnected: false });
    
    const fetchData = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/status/device`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
          if (result.data && (result.data.pc || result.data.mobile)) {
            updateState({ 
              data: result.data, 
              error: null,
              lastUpdate: result.lastUpdate || result.timestamp || null
            });
          } else {
            updateState({ data: null, error: '未获取到数据' });
          }
        } else {
          throw new Error(result.error || '数据格式错误');
        }
      } catch (err) {
        console.error(`[DeviceStatusContext] 轮询失败:`, err.message);
        updateState({ 
          error: err.name === 'AbortError' ? '请求超时，请检查网络连接' : '未获取到数据',
          data: null 
        });
      } finally {
        updateState({ loading: false });
      }
    };

    // 立即获取一次
    await fetchData();

    // 定期轮询
    const intervalId = setInterval(fetchData, 10000);
    
    return () => clearInterval(intervalId);
  };

  // WebSocket 连接函数（只创建一次）
  const connectWebSocket = () => {
    // 如果已有打开的连接，直接返回
    if (globalWS?.readyState === WebSocket.OPEN || globalWS?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // 关闭旧连接（如果存在）
    if (globalWS) {
      try {
        globalWS.close();
      } catch (e) {
        // 忽略关闭错误
      }
    }

    try {
      const ws = new WebSocket(wsUrl);
      globalWS = ws;

      ws.onopen = () => {
        updateState({
          isConnected: true,
          isUsingFallback: false,
          error: null
        });
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'deviceStatus') {
            // 支持多设备数据结构：检查是否有任何设备数据
            if (message.data && Object.keys(message.data).length > 0) {
              // 为了向后兼容，同时设置 pc 和 mobile 字段（如果存在对应类型的设备）
              const devices = message.data;
              const formattedData = { ...devices };
              
              // 查找 PC 类型设备：优先查找 id === 'pc' 且 type === 'pc' 的设备，确保排除手机设备
              const pcDevice = Object.values(devices).find(device => 
                device && 
                device.id === 'pc' && 
                device.type === 'pc' &&
                device.type !== 'mobile' && 
                device.type !== 'android'
              ) || Object.values(devices).find(device => 
                device && 
                device.type === 'pc' && 
                device.type !== 'mobile' && 
                device.type !== 'android' &&
                device.id !== 'mobile'
              );
              if (pcDevice) {
                formattedData.pc = pcDevice;
              }
              
              // 查找 Mobile 类型设备
              const mobileDevice = Object.values(devices).find(device => device.type === 'mobile' || device.type === 'android');
              if (mobileDevice) {
                formattedData.mobile = mobileDevice;
              }
              
              updateState({
                data: formattedData,
                isUsingFallback: false,
                error: null,
                lastUpdate: message.lastUpdate || message.timestamp || null
              });
            } else {
              updateState({
                data: null,
                error: '未获取到数据'
              });
            }
            updateState({ loading: false });
          }
        } catch (err) {
          console.error('[DeviceStatusContext] 消息解析失败:', err);
          updateState({ error: '数据解析失败', loading: false });
        }
      };

      ws.onerror = (error) => {
        console.error('[DeviceStatusContext] WebSocket 连接错误:', error);
        updateState({ isConnected: false });
      };

      ws.onclose = () => {
        updateState({ isConnected: false });
        
        // 自动重连
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.warn('[DeviceStatusContext] 重连失败，降级到轮询模式');
          fallbackToPolling();
        }
      };
    } catch (err) {
      console.error('[DeviceStatusContext] WebSocket 连接失败:', err);
      fallbackToPolling();
    }
  };

  // 初始化连接（只执行一次，使用 ref 标志）
  useEffect(() => {
    // 如果已经初始化过，直接使用现有状态
    if (isInitializedRef.current) {
      updateState({
        data: globalWSData,
        loading: globalWSLoading,
        error: globalWSError,
        isConnected: globalWSConnected,
        isUsingFallback: globalWSFallback,
        lastUpdate: globalLastUpdate
      });
      return;
    }
    
    // 标记为已初始化
    isInitializedRef.current = true;
    isInitialized = true;
    
    // 如果已有连接，直接使用
    if (globalWS?.readyState === WebSocket.OPEN) {
      updateState({
        data: globalWSData,
        loading: globalWSLoading,
        error: globalWSError,
        isConnected: true,
        isUsingFallback: globalWSFallback,
        lastUpdate: globalLastUpdate
      });
    } else if (!globalWS || globalWS.readyState === WebSocket.CLOSED) {
      // 如果 lastUpdate 为 null（页面刷新），立即从 API 获取一次数据
      // 这样可以确保刷新后立即显示正确的同步时间
      if (!globalLastUpdate) {
        const fetchInitialData = async () => {
          try {
            const response = await fetch(`${apiBaseUrl}/api/status/device`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
            });

            if (response.ok) {
              const result = await response.json();
              if (result.success && result.data) {
                updateState({ 
                  data: result.data, 
                  error: null,
                  lastUpdate: result.lastUpdate || result.timestamp || null,
                  loading: false
                });
              }
            }
          } catch (err) {
            console.error('[DeviceStatusContext] 初始数据获取失败:', err);
          }
        };
        fetchInitialData();
      }
      
      // 尝试 WebSocket 连接（只创建一次）
      connectWebSocket();
      
      // 如果3秒后还没连接成功，降级到轮询
      const fallbackTimer = setTimeout(() => {
        if (!globalWSConnected && !globalWSData) {
          fallbackToPolling();
        }
      }, 3000);
      
      return () => {
        clearTimeout(fallbackTimer);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };
    }
  }, []); // 空依赖数组，只执行一次

  // 手动刷新函数
  const refetch = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/status/device`);
      const result = await response.json();
      if (result.success && result.data) {
        updateState({ 
          data: result.data,
          lastUpdate: result.lastUpdate || result.timestamp || null
        });
      }
    } catch (err) {
      console.error('[refetch] 失败:', err);
    }
  };

  const value = {
    data,
    loading,
    error,
    isUsingFallback,
    isConnected,
    lastUpdate,
    refetch
  };

  return (
    <DeviceStatusContext.Provider value={value}>
      {children}
    </DeviceStatusContext.Provider>
  );
};

/**
 * 使用设备状态的 Hook（从 Context 获取）
 */
export const useDeviceStatusContext = () => {
  const context = useContext(DeviceStatusContext);
  if (!context) {
    throw new Error('useDeviceStatusContext must be used within DeviceStatusProvider');
  }
  return context;
};

