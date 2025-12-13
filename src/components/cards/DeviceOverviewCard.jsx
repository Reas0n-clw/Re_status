import { Monitor, Laptop, Smartphone } from 'lucide-react';
import DeviceCard from './DeviceCard';
import { useDeviceStatusContext } from '../../contexts/DeviceStatusContext';
import { MOCK_DATA } from '../../data/mock';
import { useState, useEffect } from 'react';

/**
 * 计算时间差（分钟，精确到秒）
 */
const getTimeDiffMinutes = (lastUpdate) => {
  if (!lastUpdate) return null;
  
  const now = new Date();
  const updateTime = new Date(lastUpdate);
  
  // 检查日期是否有效
  if (isNaN(updateTime.getTime())) {
    return null;
  }
  
  const diffMs = now - updateTime;
  // 返回精确的分钟数（浮点数），用于精确判断阈值
  const diffMinutes = diffMs / (1000 * 60);
  
  return diffMinutes;
};

/**
 * 获取设备状态（基于时间阈值的三态系统）
 * @param {string|null} lastUpdate - 最后更新时间戳
 * @param {object} t - 翻译对象
 * @returns {object} { status: 'online'|'warning'|'offline', colorClass: string, text: string, animate: boolean }
 */
export const getStatus = (lastUpdate, t) => {
  const diffMinutes = getTimeDiffMinutes(lastUpdate);
  
  // 离线：diff > 1分钟 或 lastUpdate 为空
  if (diffMinutes === null || diffMinutes > 1) {
    return {
      status: 'offline',
      colorClass: 'bg-red-500',
      text: t.device.statusOffline,
      animate: false
    };
  }
  
  // 延迟：0.5 < diff <= 1分钟
  if (diffMinutes > 0.5) {
    return {
      status: 'warning',
      colorClass: 'bg-yellow-500',
      text: t.device.statusDelay,
      animate: false
    };
  }
  
  // 在线：diff <= 0.5分钟（30秒内）
  return {
    status: 'online',
    colorClass: 'bg-green-500',
    text: t.device.statusOnline,
    animate: true
  };
};

// 在加载阶段返回“等待数据”状态，避免首次刷新时闪烁离线
const getStatusWithLoading = (lastUpdate, t, loading) => {
  if (loading && !lastUpdate) {
    return {
      status: 'loading',
      colorClass: 'bg-slate-400',
      text: t.system.loading || '加载中',
      animate: true
    };
  }
  return getStatus(lastUpdate, t);
};

/**
 * 格式化时间差（例如：刚刚、1分钟前、2小时前）
 */
const formatTimeAgo = (lastUpdate, lang = 'zh', t = null) => {
  // 如果没有lastUpdate，返回"等待数据"或"从未同步"
  if (!lastUpdate) {
    return t ? t.device.waitingForData : (lang === 'zh' ? '等待数据...' : 'Waiting for data...');
  }
  
  const now = new Date();
  const updateTime = new Date(lastUpdate);
  
  // 检查日期是否有效
  if (isNaN(updateTime.getTime())) {
    return t ? t.device.neverSynced : (lang === 'zh' ? '从未同步' : 'Never synced');
  }
  
  const diffMs = now - updateTime;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (lang === 'zh') {
    if (diffSeconds < 5) return '刚刚';
    if (diffSeconds < 60) return `${diffSeconds}秒前`;
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    return `${diffDays}天前`;
  } else {
    if (diffSeconds < 5) return 'Just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }
};

/**
 * 设备概况卡片组件
 */
const DeviceOverviewCard = ({ cardClass, t, onViewDetails, lang = 'zh' }) => {
  // 使用 Context 获取设备状态（共享 WebSocket 连接）
  const { data: deviceData, loading, error, isUsingFallback, isConnected, lastUpdate } = useDeviceStatusContext();
  
  // 实时更新时间差显示（使用API返回的lastUpdate，而不是本地时间）
  const [timeAgo, setTimeAgo] = useState(() => formatTimeAgo(lastUpdate, lang, t));
  
  // 设备状态（基于时间阈值的三态系统）；加载中且无lastUpdate时不闪离线
  const [deviceStatus, setDeviceStatus] = useState(() => getStatusWithLoading(lastUpdate, t, loading));
  
  // 更新时间差显示（每秒更新）
  useEffect(() => {
    // 立即更新一次（使用API返回的lastUpdate）
    setTimeAgo(formatTimeAgo(lastUpdate, lang, t));
    
    // 如果lastUpdate为null，不需要定时更新
    if (!lastUpdate) {
      return;
    }
    
    // 每秒更新一次时间差
    const interval = setInterval(() => {
      setTimeAgo(formatTimeAgo(lastUpdate, lang, t));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [lastUpdate, lang, t]);
  
  // 更新设备状态（每10秒更新一次，确保状态随时间变化，因为阈值更短了）
  useEffect(() => {
    // 立即计算一次状态（加载中时避免闪红）
    setDeviceStatus(getStatusWithLoading(lastUpdate, t, loading));
    
    // 每10秒更新一次状态计算（因为阈值更短，需要更频繁的更新）
    // 即使后端数据没变，随着时间推移，状态也应该从绿变黄再变红
    const statusInterval = setInterval(() => {
      setDeviceStatus(getStatusWithLoading(lastUpdate, t, loading));
    }, 10000); // 10秒更新一次，确保在0.5分钟和1分钟阈值时能及时更新
    
    return () => clearInterval(statusInterval);
  }, [lastUpdate, t, loading]);

  // 使用实时数据，如果没有数据则使用空对象
  const pcDevice = deviceData?.pc;
  
  // 获取所有非 PC 设备
  const allDevices = deviceData ? Object.values(deviceData) : [];
  const mobileDevices = allDevices.filter(d => 
    d && 
    d.id !== 'pc' && 
    d.id !== undefined &&
    (d.type !== 'pc' || d.type === undefined) // 排除 PC 类型设备
  );
  
  // 智能选择最佳手机设备：优先显示在线的，其次显示最近更新的
  const mobileDevice = mobileDevices.length > 0 ? mobileDevices.sort((a, b) => {
    // 1. 在线状态优先
    const aOnline = a.status === 'online';
    const bOnline = b.status === 'online';
    if (aOnline && !bOnline) return -1; // a 排前面
    if (!aOnline && bOnline) return 1;  // b 排前面
    
    // 2. 时间倒序（最新的排前面）
    const timeA = new Date(a.lastUpdate || 0).getTime();
    const timeB = new Date(b.lastUpdate || 0).getTime();
    return timeB - timeA;
  })[0] : null;

  // 为每个设备计算状态：优先使用后端传来的 status，如果没有则基于 lastUpdate 计算
  const getDeviceStatus = (device) => {
    if (!device) return null;
    
    // 如果后端已经提供了 status 字段，直接使用它
    if (device.status === 'online' || device.status === 'warning' || device.status === 'offline') {
      const statusMap = {
        'online': {
          status: 'online',
          colorClass: 'bg-green-500',
          text: t.device.statusOnline,
          animate: true
        },
        'warning': {
          status: 'warning',
          colorClass: 'bg-yellow-500',
          text: t.device.statusDelay,
          animate: false
        },
        'offline': {
          status: 'offline',
          colorClass: 'bg-red-500',
          text: t.device.statusOffline,
          animate: false
        }
      };
      return statusMap[device.status] || getStatus(device.lastUpdate, t);
    }
    
    // 如果后端没有提供 status，则基于 lastUpdate 计算
    return getStatus(device.lastUpdate, t);
  };
  
  const pcDeviceStatus = getDeviceStatus(pcDevice);
  const mobileDeviceStatus = getDeviceStatus(mobileDevice);

  // 创建默认的离线手机设备对象（如果不存在）
  const defaultMobileDevice = mobileDevice || {
    id: 'mobile',
    name: lang === 'zh' ? '手机' : 'Mobile',
    type: 'mobile',
    os: 'Android',
    status: 'offline',
    battery: null,
    isCharging: false,
    networkType: null,
    currentApp: { name: 'Unknown', icon: '📱' },
    lastUpdate: null
  };

  // 为默认设备计算状态
  const defaultMobileDeviceStatus = mobileDevice ? mobileDeviceStatus : getStatus(null, t);

  // 统一的离线卡片组件
  const OfflineCard = ({ icon: Icon, text }) => (
    <div className="h-full min-h-[140px] flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 transition-colors hover:bg-slate-50/80">
      <div className="p-3 bg-white rounded-full shadow-sm mb-3 border border-slate-100">
        <Icon size={24} className="opacity-50" />
      </div>
      <span className="text-sm font-medium text-slate-500">{text}</span>
    </div>
  );

  return (
    <section className={cardClass}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-700">
          <Monitor className="text-purple-500" size={20} /> {t.headers.deviceOverview}
        </h2>
        <div className="flex items-center gap-2">
          {/* 基于时间阈值的三态状态显示 */}
          <div className="flex items-center gap-1.5">
            <span 
              className={`w-2.5 h-2.5 rounded-full ${deviceStatus.colorClass} ${
                deviceStatus.animate ? 'animate-pulse' : ''
              }`}
              title={deviceStatus.text}
            />
            <span className="text-xs font-medium text-slate-600">
              {deviceStatus.text}
            </span>
          </div>
          <div className="text-xs font-mono text-slate-400">
            {lang === 'zh' ? '同步于 ' : 'Synced '}{timeAgo}
          </div>
        </div>
      </div>
      {loading && !deviceData ? (
        <div className="text-center py-8 text-slate-400">{t.system.loading}</div>
      ) : error ? (
        <div className="text-center py-8">
          <div className="text-slate-400 mb-2">⚠️ {error}</div>
          <div className="text-xs text-slate-300">{t.device.checkBackendService}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 左侧：PC 卡片 */}
          <div className="h-full">
            {pcDevice ? (
            <DeviceCard 
              deviceType="pc" 
              device={pcDevice}
              cardClass={cardClass} 
              t={t} 
              onViewDetails={onViewDetails}
                deviceStatus={pcDeviceStatus}
            />
            ) : (
              <OfflineCard 
                icon={Laptop} 
                text={lang === 'zh' ? 'PC 离线' : 'PC Offline'} 
              />
            )}
          </div>

          {/* 右侧：手机卡片 - 始终渲染 DeviceCard，让它内部处理离线状态 */}
          <div className="h-full">
            <DeviceCard 
              deviceType="mobile" 
              device={defaultMobileDevice}
              cardClass={cardClass} 
              t={t} 
              onViewDetails={onViewDetails}
              deviceStatus={defaultMobileDeviceStatus}
            />
            </div>
        </div>
      )}
    </section>
  );
};

export default DeviceOverviewCard;

