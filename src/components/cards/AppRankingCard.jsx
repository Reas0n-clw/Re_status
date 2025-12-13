import { BarChart3, Loader2, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getApiBaseUrl } from '../../utils/api';

/**
 * 格式化时长（秒数转易读格式）
 * @param {number} seconds - 秒数
 * @returns {string} 格式化后的时间字符串，如 "1h 20m", "45s", "2h 5m 30s"
 */
const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 && hours === 0) parts.push(`${secs}s`); // 只有没有小时时才显示秒
  
  return parts.length > 0 ? parts.join(' ') : '0s';
};

/**
 * 今日应用排行卡片组件
 */
const AppRankingCard = ({ cardClass, t, lang = 'zh' }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 获取今日应用排行数据
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const apiBaseUrl = getApiBaseUrl();
        const response = await fetch(`${apiBaseUrl}/api/stats/today`, {
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
          setData(result.data || []);
        } else {
          throw new Error(result.error || '获取数据失败');
        }
      } catch (err) {
        console.error('[AppRankingCard] 获取数据失败:', err);
        setError(err.message);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    
    // 每30秒自动刷新一次
    const interval = setInterval(fetchStats, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // 加载状态
  if (loading && !data) {
    return (
      <section className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-700">
            <BarChart3 className="text-indigo-500" size={20} /> 
            {lang === 'zh' ? '今日应用排行' : 'Today\'s App Ranking'}
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
    return (
      <section className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-700">
            <BarChart3 className="text-indigo-500" size={20} /> 
            {lang === 'zh' ? '今日应用排行' : 'Today\'s App Ranking'}
          </h2>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-slate-400 mb-2">⚠️ {error}</div>
          <div className="text-xs text-slate-300">
            {lang === 'zh' ? '请检查后端服务' : 'Please check backend service'}
          </div>
        </div>
      </section>
    );
  }

  // 空数据状态
  if (!data || data.length === 0) {
    return (
      <section className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-700">
            <BarChart3 className="text-indigo-500" size={20} /> 
            {lang === 'zh' ? '今日应用排行' : 'Today\'s App Ranking'}
          </h2>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Clock size={32} className="text-slate-300 mb-2" />
          <div className="text-sm text-slate-400">
            {lang === 'zh' ? '今日暂无数据' : 'No data today'}
          </div>
        </div>
      </section>
    );
  }

  // 计算最大时长（用于进度条百分比）
  const maxDuration = data[0]?.duration || 1;
  
  // 只显示前 5-7 个应用（取前 7 个）
  const displayApps = data.slice(0, 7);

  return (
    <section className={cardClass}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-700">
          <BarChart3 className="text-indigo-500" size={20} /> 
          {lang === 'zh' ? '今日应用排行' : 'Today\'s App Ranking'}
        </h2>
      </div>
      
      <div className="space-y-2">
        {displayApps.map((app, index) => {
          const percentage = maxDuration > 0 ? (app.duration / maxDuration) * 100 : 0;
          
          return (
            <div 
              key={index} 
              className="flex items-center gap-2.5 group hover:bg-slate-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
            >
              {/* 排名和图标 */}
              <div className="flex items-center gap-1.5 flex-shrink-0 min-w-0" style={{ width: '38%' }}>
                <span className="text-[10px] font-bold text-slate-400 w-3 text-right flex-shrink-0">
                  {index + 1}
                </span>
                <span className="text-sm flex-shrink-0">💻</span>
                <span className="text-xs font-medium text-slate-700 truncate min-w-0">
                  {app.name}
                </span>
              </div>
              
              {/* 进度条 */}
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              
              {/* 时间 */}
              <div className="flex-shrink-0 text-right min-w-[48px]">
                <span className="text-[10px] font-medium text-slate-600">
                  {formatDuration(app.duration)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default AppRankingCard;

