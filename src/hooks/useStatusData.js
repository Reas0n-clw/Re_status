import { useState, useEffect, useRef } from 'react';
import { getApiBaseUrl } from '../utils/api';
import { getBrowserGeolocation, isGeolocationSupported } from '../utils/geolocation';

/**
 * 获取状态数据的 React Hook
 * 如果 API 请求失败或没有数据，显示错误提示
 * 
 * @param {string} endpoint - API 端点名称 ('steam' | 'bilibili' | 'weather')
 * @param {object} options - 配置选项
 * @param {string} options.apiBaseUrl - API 基础 URL，默认为 'http://localhost:3000'
 * @param {number} options.refreshInterval - 自动刷新间隔（毫秒），默认不自动刷新
 * @param {boolean} options.enabled - 是否启用请求，默认为 true
 * @returns {object} { data, loading, error, refetch }
 */
export const useStatusData = (endpoint, options = {}) => {
  const {
    apiBaseUrl = getApiBaseUrl(), // 动态获取 API 基础 URL（自动适配当前访问地址）
    refreshInterval = null,
    enabled = true
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  const isInitialLoadRef = useRef(true);

  // 获取数据的函数
  const fetchData = async (showLoading = true) => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    // 只在首次加载或明确要求时显示loading状态，刷新时不显示
    if (showLoading && isInitialLoadRef.current) {
    setLoading(true);
    }
    setError(null);

    try {
      let url = `${apiBaseUrl}/api/status/${endpoint}`;
      
      // 对于天气请求，优先使用浏览器定位
      if (endpoint === 'weather') {
        let locationParams = null;
        
        // 尝试获取浏览器地理位置
        if (isGeolocationSupported()) {
          try {
            const geoLocation = await getBrowserGeolocation({ timeout: 5000 });
            locationParams = `lat=${geoLocation.lat}&lon=${geoLocation.lon}`;
            console.log('[useStatusData] 使用浏览器定位:', geoLocation);
          } catch (geoError) {
            // 浏览器定位失败，回退到IP定位
            console.log('[useStatusData] 浏览器定位失败，回退到IP定位:', geoError.message);
            // locationParams 保持为 null，后端将使用IP定位
          }
        }
        
        // 如果有经纬度参数，添加到URL
        if (locationParams) {
          url += `?${locationParams}`;
        }
      }
      
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
        // HTTP错误，尝试解析响应体获取错误信息
        let errorData = null;
        try {
          errorData = await response.json();
        } catch (e) {
          // 无法解析JSON，使用默认错误
        }
        
        const errorMessage = errorData?.error || `HTTP error! status: ${response.status}`;
        const errorObj = new Error(errorMessage);
        errorObj.errorCode = errorData?.errorCode || 'HTTP_ERROR';
        errorObj.errorMessage = errorMessage;
        throw errorObj;
      }

      const result = await response.json();
      
      if (result.success) {
        // 检查数据是否存在
        if (result.data && Object.keys(result.data).length > 0) {
          setData(result.data);
          setIsUsingFallback(false);
          setError(null);
          isInitialLoadRef.current = false; // 标记已加载过数据
        } else {
          // 后端返回成功但没有数据
          setData(null);
          setIsUsingFallback(false);
          setError('未获取到数据');
        }
      } else {
        // 后端返回错误，保留错误信息和错误代码
        const errorMessage = result.error || result.message || '数据格式错误';
        const errorObj = new Error(errorMessage);
        errorObj.errorCode = result.errorCode;
        errorObj.errorMessage = errorMessage;
        console.error(`[useStatusData] 后端返回错误 (${endpoint}):`, {
          error: result.error,
          errorCode: result.errorCode,
          message: result.message,
          fullResponse: result
        });
        throw errorObj;
      }
    } catch (err) {
      console.error(`[useStatusData] API 请求失败 (${endpoint}):`, err.message);
      
      // 保留错误信息，包括错误代码和错误消息
      if (err.errorCode && err.errorMessage) {
        setError({
          code: err.errorCode,
          message: err.errorMessage
        });
      } else {
        setError({
          code: err.name === 'AbortError' ? 'TIMEOUT' : 'UNKNOWN',
          message: err.name === 'AbortError' ? '请求超时，请检查网络连接' : '未获取到数据'
        });
      }
      setData(null);
      setIsUsingFallback(false);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载和刷新
  useEffect(() => {
    // 首次加载（显示loading）
    fetchData(true);

    // 如果设置了刷新间隔，则定时刷新（不显示loading）
    let intervalId = null;
    if (refreshInterval && refreshInterval > 0) {
      intervalId = setInterval(() => {
        fetchData(false);
      }, refreshInterval);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, apiBaseUrl, enabled, refreshInterval]);

  // 手动刷新函数
  const refetch = () => {
    fetchData();
  };

  return {
    data,
    loading,
    error,
    isUsingFallback, // 是否正在使用降级数据
    refetch
  };
};

/**
 * 批量获取多个状态数据的 Hook
 * 
 * @param {string[]} endpoints - 端点数组
 * @param {object} options - 配置选项（同 useStatusData）
 * @returns {object} { data, loading, error, refetch }
 */
export const useMultipleStatusData = (endpoints, options = {}) => {
  const results = endpoints.map(endpoint => useStatusData(endpoint, options));

  const data = {};
  let loading = false;
  let error = null;
  let isUsingFallback = false;

  endpoints.forEach((endpoint, index) => {
    data[endpoint] = results[index].data;
    loading = loading || results[index].loading;
    if (results[index].error) {
      error = results[index].error;
    }
    if (results[index].isUsingFallback) {
      isUsingFallback = true;
    }
  });

  const refetch = () => {
    results.forEach(result => result.refetch());
  };

  return {
    data,
    loading,
    error,
    isUsingFallback,
    refetch
  };
};

