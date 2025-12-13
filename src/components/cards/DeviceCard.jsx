import { Laptop, Smartphone, BarChart2, Zap, Wifi, Signal, MonitorOff } from 'lucide-react';

const DeviceCard = ({ deviceType, device, cardClass, t, onViewDetails, deviceStatus }) => {
  if (!device) return null;

  
  const deviceData = device;
  // 判断设备类型
  const isPC = deviceType === 'pc' || deviceData.type === 'pc';
  const Icon = isPC ? Laptop : Smartphone;
  
  // 样式配置
  const styles = isPC ? {
    hover: 'hover:border-purple-200',
    icon: 'text-purple-600',
    btn: 'text-purple-500 hover:text-purple-600'
  } : {
    hover: 'hover:border-pink-200',
    icon: 'text-pink-500',
    btn: 'text-pink-500 hover:text-pink-600'
  };
  
  // 状态指示器逻辑
  const getStatusIndicatorStyle = () => {
    // 优先判断 sleep 状态，覆盖传入的 deviceStatus
    if (deviceData.status === 'sleep') {
      return {
        dotColor: 'bg-indigo-500',
        dotAnimate: '',
        bgColor: 'bg-indigo-50',
        borderColor: 'border-indigo-100',
        textColor: 'text-indigo-600'
      };
    }
    const status = deviceStatus?.status || deviceData.status;
    if (status === 'online') return { dotColor: 'bg-green-500', dotAnimate: 'animate-pulse', bgColor: 'bg-green-50', borderColor: 'border-green-100', textColor: 'text-green-600' };
    if (status === 'warning') return { dotColor: 'bg-yellow-500', dotAnimate: '', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-100', textColor: 'text-yellow-600' };
    if (status === 'sleep') return { dotColor: 'bg-indigo-400', dotAnimate: '', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-100', textColor: 'text-indigo-600' };
    return { dotColor: 'bg-red-500', dotAnimate: '', bgColor: 'bg-red-50', borderColor: 'border-red-100', textColor: 'text-red-600' };
  };
  
  const statusStyle = getStatusIndicatorStyle();
  const status = deviceStatus?.status || deviceData.status;
  const isOnline = status === 'online';
  const isSleep = deviceData.status === 'sleep';
  return (
    <div className={`bg-slate-50/80 rounded-xl p-4 border border-slate-100 relative overflow-hidden group ${styles.hover} transition-colors`}>
      {/* 背景大图标装饰 */}
      <div className="absolute right-2 top-2 text-slate-200 transform rotate-12 group-hover:scale-110 transition-transform duration-500 pointer-events-none">
        <Icon size={64} strokeWidth={1} />
      </div>
      <div className="relative z-10">
        {/* 头部：图标 + 名称 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 bg-white border border-slate-100 ${styles.icon} rounded-xl shadow-sm`}>
              <Icon size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-700 text-sm leading-tight">{deviceData.name}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                 {/* 手机特有：仅在在线时显示网络状态图标 */}
                 {!isPC && isOnline && deviceData.networkType && (
                    <span className="text-[10px] bg-slate-100 px-1 rounded flex items-center gap-0.5 text-slate-500">
                      {deviceData.networkType.includes('Wifi') ? <Wifi size={10}/> : <Signal size={10}/>}
                      {deviceData.networkType}
                    </span>
                 )}
                 <p className="text-[10px] text-slate-400 font-medium">{deviceData.os}</p>
              </div>
            </div>
          </div>
          <button 
            // 始终使用传入的 deviceType 作为标识，以保证与弹窗条件匹配
            onClick={() => onViewDetails(deviceType || device.id)}
            className={`p-1.5 bg-white/80 hover:bg-white ${styles.btn} rounded-lg shadow-sm border border-slate-100 transition-all active:scale-95`}
            title={t.device.viewDetails}
          >
            <BarChart2 size={16} />
          </button>
        </div>
        {/* 中间信息区 */}
        <div className="space-y-2 mt-2">
          {isPC ? (
            // PC 布局
            <>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">{t.device.status}</span>
                <span className={`font-bold flex items-center gap-1.5 px-2 py-0.5 rounded-md border ${statusStyle.bgColor} ${statusStyle.borderColor} ${statusStyle.textColor}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dotColor} ${statusStyle.dotAnimate}`}></span>
                  {deviceData.status === 'sleep' ? '已息屏' : (deviceStatus ? deviceStatus.text : deviceData.status)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">{t.device.uptime}</span>
                <span className="text-slate-700 font-mono">{deviceData.uptime}</span>
              </div>
            </>
          ) : (
            // 手机布局
            <>
              {/* 手机状态行，保持与 PC 一致的状态展示 */}
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">{t.device.status}</span>
                <span className={`font-bold flex items-center gap-1.5 px-2 py-0.5 rounded-md border ${statusStyle.bgColor} ${statusStyle.borderColor} ${statusStyle.textColor}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dotColor} ${statusStyle.dotAnimate}`}></span>
                  {deviceData.status === 'sleep' ? '已息屏' : (deviceStatus ? deviceStatus.text : deviceData.status)}
                </span>
              </div>

              {isOnline && (
                // 在线时显示电量信息；离线时不显示电量
                <>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">{t.device.battery}</span>
                    <span className={`font-bold flex items-center gap-1 ${deviceData.isCharging ? 'text-green-600' : 'text-slate-700'}`}>
                      {deviceData.battery || 0}%
                      {deviceData.isCharging && <Zap size={12} className="fill-current animate-bounce"/>}
                    </span>
                  </div>
                  {/* 电量条 */}
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        (deviceData.battery || 0) < 20 ? 'bg-red-500' : (deviceData.isCharging ? 'bg-green-500' : 'bg-slate-600')
                      }`} 
                      style={{width: `${deviceData.battery || 0}%`}}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
        {/* 底部：当前应用 (PC和手机都显示) */}
        <div className="mt-3 pt-3 border-t border-slate-200/60">
          {deviceData.status === 'sleep' ? (
            <>
              <p className="text-[10px] text-slate-400 mb-1.5 font-medium uppercase tracking-wider">
                {isPC ? t.device.activeApp : t.device.activeApp}
              </p>
              <div className="flex items-center gap-2 bg-indigo-50/80 p-1.5 rounded-lg border border-indigo-100 text-indigo-700">
                <MonitorOff size={18} />
                <span className="text-xs font-bold">已息屏</span>
              </div>
            </>
          ) : isOnline ? (
            // 在线时显示当前应用
            <>
              <p className="text-[10px] text-slate-400 mb-1.5 font-medium uppercase tracking-wider">
                {isPC ? t.device.activeApp : t.device.activeApp}
              </p>
              <div className="flex items-center gap-2 bg-white/60 p-1.5 rounded-lg border border-slate-100 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                <span className="text-lg flex-shrink-0">{deviceData.currentApp?.icon || (isPC ? '💻' : '📱')}</span>
                <span className="text-xs font-bold text-slate-700 truncate">
                  {deviceData.currentApp?.name || t.device.noActiveWindow}
                </span>
              </div>
            </>
          ) : (
            // 离线时显示离线状态
            <>
              <p className="text-[10px] text-slate-400 mb-1.5 font-medium uppercase tracking-wider">
                {isPC ? t.device.activeApp : t.device.activeApp}
              </p>
              <div className="flex items-center gap-2 bg-slate-50/60 p-1.5 rounded-lg border border-slate-100">
                <span className="text-xs font-medium text-slate-400">
                  {isPC ? t.device.statusOffline : (t.device.statusOffline || 'Offline')}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeviceCard;
