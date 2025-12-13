/**
 * 地理位置工具函数
 * 封装浏览器 Geolocation API，提供统一的定位接口
 */

/**
 * 获取浏览器地理位置
 * @param {object} options - 配置选项
 * @param {number} options.timeout - 超时时间（毫秒），默认5000
 * @param {number} options.maximumAge - 缓存有效期（毫秒），默认60000（1分钟）
 * @param {boolean} options.enableHighAccuracy - 是否启用高精度，默认false
 * @returns {Promise<{lat: number, lon: number}>} 返回经纬度对象
 */
export function getBrowserGeolocation(options = {}) {
  const {
    timeout = 5000,
    maximumAge = 60000, // 1分钟缓存
    enableHighAccuracy = false
  } = options;

  return new Promise((resolve, reject) => {
    // 检查浏览器是否支持 Geolocation API
    if (!navigator.geolocation) {
      reject(new Error('浏览器不支持地理位置定位'));
      return;
    }

    // 设置超时定时器
    const timeoutId = setTimeout(() => {
      reject(new Error('定位请求超时'));
    }, timeout);

    // 成功回调
    const successCallback = (position) => {
      clearTimeout(timeoutId);
      const { latitude, longitude } = position.coords;
      resolve({
        lat: latitude,
        lon: longitude
      });
    };

    // 失败回调
    const errorCallback = (error) => {
      clearTimeout(timeoutId);
      let errorMessage = '定位失败';
      
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = '用户拒绝了地理位置权限';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = '无法获取位置信息';
          break;
        case error.TIMEOUT:
          errorMessage = '定位请求超时';
          break;
        default:
          errorMessage = '定位失败：未知错误';
          break;
      }
      
      reject(new Error(errorMessage));
    };

    // 调用浏览器定位API
    navigator.geolocation.getCurrentPosition(
      successCallback,
      errorCallback,
      {
        timeout,
        maximumAge,
        enableHighAccuracy
      }
    );
  });
}

/**
 * 检查浏览器是否支持地理位置定位
 * @returns {boolean}
 */
export function isGeolocationSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

