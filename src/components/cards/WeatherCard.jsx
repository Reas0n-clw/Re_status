import { Cloud, CloudRain, Sun, Loader2, AlertCircle, RefreshCw, MapPin } from 'lucide-react';
import { useStatusData } from '../../hooks/useStatusData';
import { useState, useCallback } from 'react';

/**
 * 天气图标映射
 */
const getWeatherIcon = (condition) => {
  const conditionLower = condition?.toLowerCase() || '';
  if (conditionLower.includes('晴') || conditionLower.includes('sun') || conditionLower === 'clear') {
    return <Sun className="w-10 h-10 text-yellow-500" />;
  } else if (conditionLower.includes('雨') || conditionLower.includes('rain')) {
    return <CloudRain className="w-10 h-10 text-blue-500" />;
  } else {
    return <Cloud className="w-10 h-10 text-gray-400" />;
  }
};

/**
 * 天气卡片组件
 * 左右50/50布局，展示站长和访客天气
 */
const WeatherCard = ({ cardClass, t, lang }) => {
  const { data, loading, error, refetch } = useStatusData('weather', {
    refreshInterval: 30 * 60 * 1000 // 30分钟刷新一次
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  // 手动刷新
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000);
    }
  }, [refetch, isRefreshing]);

  // 加载状态
  if (loading && !data) {
    return (
      <section className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-700">
            <Cloud className="text-blue-500" size={20} /> {t.headers.weather}
          </h2>
        </div>
        <div className="flex justify-center items-center py-12">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      </section>
    );
  }

  // 错误状态
  if (error) {
    const errorCode = error.code || error.errorCode || 'UNKNOWN';
    let errorMessage = '';
    
    switch (errorCode) {
      case 'API_NOT_CONFIGURED':
        errorMessage = lang === 'zh' ? 'API未配置' : 'API Not Configured';
        break;
      case 'CITY_NOT_CONFIGURED':
        errorMessage = lang === 'zh' ? '城市未配置' : 'City Not Configured';
        break;
      case 'CONFIG_ERROR':
        errorMessage = lang === 'zh' ? '配置出错' : 'Configuration Error';
        break;
      case 'FETCH_ERROR':
        errorMessage = lang === 'zh' ? '数据获取失败' : 'Failed to Fetch Data';
        break;
      default:
        errorMessage = error.message || (lang === 'zh' ? '获取天气数据失败' : 'Failed to Get Weather Data');
    }
    
    return (
      <section className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-700">
            <Cloud className="text-blue-500" size={20} /> {t.headers.weather}
          </h2>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle size={32} className="text-slate-400 mb-2" />
          <p className="text-slate-600 text-sm font-medium">{errorMessage}</p>
        </div>
      </section>
    );
  }

  // 获取天气数据
  const ownerWeather = data?.owner || null;
  const visitorWeather = data?.visitor || null;

  return (
    <section className={cardClass}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-700">
          <Cloud className="text-blue-500" size={20} /> {t.headers.weather}
        </h2>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
          title={t.weather.refresh}
        >
          <RefreshCw 
            size={16} 
            className={`text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} 
          />
        </button>
      </div>

      {/* 核心内容区 - 左右50/50布局 */}
      <div className="flex gap-4 mb-4 min-h-[140px]">
        {/* 左侧 - 站长天气 */}
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          {ownerWeather ? (
            <>
              <div className="mb-2">
                {getWeatherIcon(ownerWeather.conditionZh || ownerWeather.condition)}
              </div>
              <div className="text-2xl font-bold text-gray-800 mb-1">
                {ownerWeather.temp}°C
              </div>
              <div className="text-sm text-gray-500 mb-2">
                {ownerWeather.city || t.weather.unknownLocation}
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-md">
                <MapPin size={12} /> {t.weather.base}
              </span>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400">
              <Cloud size={32} className="mb-2 opacity-50" />
              <div className="text-sm">{t.weather.notConfigured}</div>
            </div>
          )}
        </div>

        {/* 中间分割线 */}
        <div className="w-px bg-slate-200 opacity-50" />

        {/* 右侧 - 访客天气 */}
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          {visitorWeather ? (
            <>
              <div className="mb-2">
                {getWeatherIcon(visitorWeather.conditionZh || visitorWeather.condition)}
              </div>
              <div className="text-2xl font-bold text-gray-800 mb-1">
                {visitorWeather.temp}°C
              </div>
              <div className="text-sm text-gray-500 mb-2">
                {visitorWeather.city || t.weather.unknownLocation}
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-md">
                👋 You
              </span>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400">
              <MapPin size={32} className="mb-2 opacity-50" />
              <div className="text-sm">{t.weather.unknownLocation}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default WeatherCard;
