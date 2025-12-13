import { useState, useEffect, useRef } from 'react';
import { MOCK_DATA } from '../data/mock';
import { getApiBaseUrl, getWebSocketUrl } from '../utils/api';

/**
 * 使用 WebSocket 获取设备状态的 React Hook（实时版本）
 * 如果 WebSocket 连接失败，自动降级使用轮询
 * 
 * @param {object} options - 配置选项
 * @param {string} options.wsUrl - WebSocket URL，默认为 'ws://localhost:3000/ws'
 * @param {string} options.apiBaseUrl - API 基础 URL（降级时使用），默认为 'http://localhost:3000'
 * @param {number} options.fallbackInterval - 降级轮询间隔（毫秒），默认10000
 * @param {boolean} options.enabled - 是否启用请求，默认为 true
 * @returns {object} { data, loading, error, isUsingFallback, isConnected, refetch }
 */
export const useDeviceStatusWS = (options = {}) => {
  const {
    wsUrl = getWebSocketUrl(), // 动态获取 WebSocket URL（自动适配当前访问地址）
    apiBaseUrl = getApiBaseUrl(), // 动态获取 API 基础 URL（自动适配当前访问地址）
    fallbackInterval = 10000,
    enabled = true
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // WebSocket 连接函数
  const connectWebSocket = () => {
    if (!enabled || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsUsingFallback(false);
        setError(null);
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
              
              setData(formattedData);
              setIsUsingFallback(false);
              setError(null);
            } else {
              // 后端返回成功但没有数据
              setData(null);
              setError('未获取到数据');
            }
            setLoading(false);
          }
        } catch (err) {
          console.error('[WebSocket] 消息解析失败:', err);
          setError('数据解析失败');
          setLoading(false);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] 连接错误:', error);
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        
        // 自动重连
        if (enabled && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          // 重连失败，降级到轮询
          console.warn('[WebSocket] 重连失败，降级到轮询模式');
          fallbackToPolling();
        }
      };
    } catch (err) {
      console.error('[WebSocket] 连接失败:', err);
      fallbackToPolling();
    }
  };

  // 降级到轮询模式
  const fallbackToPolling = async () => {
    setIsUsingFallback(true);
    setIsConnected(false);
    
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
          // 检查数据是否存在
          if (result.data && (result.data.pc || result.data.mobile)) {
            setData(result.data);
            setError(null);
          } else {
            // 后端返回成功但没有数据
            setData(null);
            setError('未获取到数据');
          }
        } else {
          throw new Error(result.error || '数据格式错误');
        }
      } catch (err) {
        console.error(`[useDeviceStatusWS] 轮询失败:`, err.message);
        
        // 不再降级到Mock数据，直接显示错误
        setError(err.name === 'AbortError' ? '请求超时，请检查网络连接' : '未获取到数据');
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    // 立即获取一次
    await fetchData();

    // 定期轮询
    const intervalId = setInterval(fetchData, fallbackInterval);
    
    return () => clearInterval(intervalId);
  };

  // 初始连接
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    // 尝试 WebSocket 连接
    connectWebSocket();

    // 如果 WebSocket 连接失败，降级到轮询
    const fallbackTimer = setTimeout(() => {
      if (!isConnected && !data) {
        fallbackToPolling();
      }
    }, 3000); // 3秒后如果还没连接成功，降级

    return () => {
      clearTimeout(fallbackTimer);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, wsUrl]);

  // 手动刷新函数（使用轮询）
  const refetch = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/status/device`);
      const result = await response.json();
      if (result.success && result.data) {
        setData(result.data);
      }
    } catch (err) {
      console.error('[refetch] 失败:', err);
    }
  };

  return {
    data,
    loading,
    error,
    isUsingFallback,
    isConnected, // WebSocket 连接状态
    refetch
  };
};

