import { useState, useEffect } from 'react';
import { MOCK_DATA } from '../data/mock';
import { getApiBaseUrl } from '../utils/api';

/**
 * 获取设备状态的 React Hook
 * 如果 API 请求失败或没有数据，显示错误提示
 * 
 * @param {object} options - 配置选项
 * @param {string} options.apiBaseUrl - API 基础 URL，默认为 'http://localhost:3000'
 * @param {number} options.refreshInterval - 自动刷新间隔（毫秒），默认30秒
 * @param {boolean} options.enabled - 是否启用请求，默认为 true
 * @returns {object} { data, loading, error, isUsingFallback, refetch }
 */
export const useDeviceStatus = (options = {}) => {
  const {
    apiBaseUrl = getApiBaseUrl(), // 动态获取 API 基础 URL（自动适配当前访问地址）
    refreshInterval = 10000, // 10秒刷新一次，提高实时性
    enabled = true
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUsingFallback, setIsUsingFallback] = useState(false);

  // 获取数据的函数
  const fetchData = async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = `${apiBaseUrl}/api/status/device`;
      
      // 创建 AbortController 用于超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        // 检查数据是否存在
        if (result.data && (result.data.pc || result.data.mobile)) {
          setData(result.data);
          setIsUsingFallback(false);
          setError(null);
        } else {
          // 后端返回成功但没有数据
          setData(null);
          setIsUsingFallback(false);
          setError('未获取到数据');
        }
      } else {
        throw new Error(result.error || '数据格式错误');
      }
    } catch (err) {
      console.error(`[useDeviceStatus] API 请求失败:`, err.message);
      
      // 不再降级到Mock数据，直接显示错误
      setError(err.name === 'AbortError' ? '请求超时，请检查网络连接' : '未获取到数据');
      setData(null);
      setIsUsingFallback(false);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载和刷新
  useEffect(() => {
    fetchData();

    // 如果设置了刷新间隔，则定时刷新
    let intervalId = null;
    if (refreshInterval && refreshInterval > 0) {
      intervalId = setInterval(() => {
        fetchData();
      }, refreshInterval);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [apiBaseUrl, enabled, refreshInterval]);

  // 手动刷新函数
  const refetch = () => {
    fetchData();
  };

  return {
    data,
    loading,
    error,
    isUsingFallback,
    refetch
  };
};

