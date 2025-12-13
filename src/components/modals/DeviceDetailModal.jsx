import { Laptop, Smartphone, X, BarChart2 } from 'lucide-react';
import { MOCK_DATA } from '../../data/mock';
import { useAppUsage } from '../../hooks';
import { useDeviceStatusContext } from '../../contexts/DeviceStatusContext';
import { useMemo } from 'react';

/**
 * 设备详情弹窗组件
 */
const DeviceDetailModal = ({ deviceId, onClose, t }) => {
  const isPC = deviceId === 'pc';
  
  // 所有 Hooks 必须在条件返回之前调用（React Hooks 规则）
  // 获取实时设备状态（从 Context 获取，共享 WebSocket 连接）
  const { data: deviceData } = useDeviceStatusContext();
  
  // 获取设备数据
  const device = deviceData?.[deviceId];
  
  // 计算正确的设备类型和设备ID
  // 如果 deviceId 是 'mobile'，需要查找实际的手机设备
  const appUsageParams = useMemo(() => {
    if (isPC) {
      // PC设备：使用 'pc' 作为 deviceType，如果有实际设备ID则使用
      return {
        deviceType: 'pc',
        deviceId: device?.id || null
      };
    } else {
      // 手机设备：对齐 PC 逻辑，固定使用 'mobile'，ID 优先真实 ID，缺失则用 'mobile' 兜底
      if (device && device.id) {
        return {
          deviceType: 'mobile',
          deviceId: device.id
        };
      } else {
        // 如果没有设备数据，尝试从所有设备中查找手机设备
        const allDevices = deviceData ? Object.values(deviceData) : [];
        const mobileDevice = allDevices.find(d => 
          d && 
          d.id !== 'pc' && 
          d.id !== undefined &&
          (d.type === 'mobile' || d.type === 'android' || d.type === undefined)
        );
        
        if (mobileDevice && mobileDevice.id) {
          return {
            deviceType: 'mobile',
            deviceId: mobileDevice.id
          };
        }
        
        // 最后的后备方案：使用固定 'mobile'
        return {
          deviceType: 'mobile',
          deviceId: 'mobile'
        };
      }
    }
  }, [deviceData, device, isPC, deviceId]);
  
  // 获取今日应用使用统计
  const { data: apps, loading, error, isUsingFallback } = useAppUsage({
    deviceType: appUsageParams.deviceType,
    deviceId: appUsageParams.deviceId,
    refreshInterval: 30000 // 30秒刷新一次
  });
  
  // 如果没有数据，使用空数组
  const displayApps = apps || [];
  
  // 如果没有设备数据，显示错误提示（但不能提前返回，必须在所有 Hooks 之后）
  const hasDeviceData = !!device;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white/95 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white/50">
        <div className={`p-6 ${isPC ? 'bg-purple-50' : 'bg-pink-50'} border-b border-slate-100 flex justify-between items-start`}>
          <div className="flex items-center gap-4">
             <div className={`p-3 rounded-2xl shadow-sm bg-white ${isPC ? 'text-purple-500' : 'text-pink-500'}`}>
               {isPC ? <Laptop size={24} /> : <Smartphone size={24} />}
             </div>
             <div>
               {hasDeviceData ? (
                 <>
                   <h3 className="text-xl font-bold text-slate-800">{device.name}</h3>
                   <p className="text-xs text-slate-500 font-mono mt-1">{device.os} • {isPC ? device.uptime : `${device.battery}% Battery`}</p>
                 </>
               ) : (
                 <>
                   <h3 className="text-xl font-bold text-slate-800">{isPC ? t.device.pc : t.device.mobile}</h3>
                   <p className="text-xs text-slate-500 font-mono mt-1">{t.device.noDeviceDataReceived}</p>
                 </>
               )}
             </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <BarChart2 size={16} /> {t.device.todayTop}
            </h4>
            {isUsingFallback && (
              <span className="text-xs text-yellow-500" title="使用本地数据">⚠️</span>
            )}
          </div>
          {loading ? (
            <div className="text-center py-8 text-slate-400">{t.system.loading}</div>
          ) : error ? (
            <div className="text-center py-8">
              <div className="text-slate-400 mb-2">⚠️ {error}</div>
              <div className="text-xs text-slate-300">{t.device.checkBackendService}</div>
            </div>
          ) : !displayApps || displayApps.length === 0 ? (
            <div className="text-center py-8 text-slate-400">{t.device.noUsageRecord}</div>
          ) : (
            <div className="space-y-4">
              {displayApps.map((app, index) => (
              <div key={index} className="group">
                <div className="flex items-center justify-between mb-2 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center text-lg">{app.icon}</span>
                    <span className="font-semibold text-slate-700">{app.name}</span>
                    {app.category && app.category !== 'Unknown' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">{app.category}</span>
                    )}
                  </div>
                  <span className="font-mono text-slate-500 font-medium">{app.time}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-1000 ${isPC ? 'bg-purple-500' : 'bg-pink-500'}`} style={{ width: `${app.percent}%` }} />
                </div>
              </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeviceDetailModal;

