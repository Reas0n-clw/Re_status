import React, { useState, useEffect } from 'react';
import { 
  Settings,
  Menu,
  X,
  Languages
} from 'lucide-react';

// 导入组件
import { DeviceDetailModal } from './components/modals';
import { 
  ProfileCard, 
  DeviceOverviewCard, 
  GameStatusCard, 
  WeatherCard
  // HealthCard 已移除
} from './components/cards';

// 导入数据
import { TRANSLATIONS } from './data/i18n';
import { MOCK_DATA } from './data/mock';

// 导入 Context
import { DeviceStatusProvider } from './contexts/DeviceStatusContext';

// 导入平台配置
import { getEnabledPlatforms } from './config/platforms';

/**
 * 个人状态展示网站 - UI 原型 V3.6 (美化版)
 * 优化布局结构，移除健康数据，提升视觉体验
 */
const App = () => {
  // 获取启用的平台列表
  const enabledPlatforms = getEnabledPlatforms();
  const defaultPlatform = enabledPlatforms.length > 0 ? enabledPlatforms[0] : 'steam';

  // 状态管理
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLowPowerMode, setIsLowPowerMode] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [activeDeviceDetail, setActiveDeviceDetail] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);
  const [siteConfig, setSiteConfig] = useState(null); 
  const [lang, setLang] = useState('zh');
  const [activeGameCard, setActiveGameCard] = useState(defaultPlatform);
  const [bgOpacity, setBgOpacity] = useState(0.9); 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const t = TRANSLATIONS[lang]; 

  // 语言切换
  const toggleLanguage = () => {
    setLang(prev => prev === 'zh' ? 'en' : 'zh');
  };

  // 获取个人资料数据
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setProfileLoading(true);
        setProfileError(null);
        setProfile(null); 
        setSiteConfig(null);
        
        const response = await fetch('/api/profile');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            setSiteConfig(data.data);
            setProfile(data.data.profile);
          } else {
            setProfile(null);
            setSiteConfig(null);
          }
        } else {
          setProfile(null);
          setSiteConfig(null);
          setProfileError(`HTTP ${response.status}`);
        }
      } catch (error) {
        console.error('获取个人资料失败:', error);
        setProfile(null);
        setSiteConfig(null);
        setProfileError(error.message || 'Network error');
      } finally {
        setProfileLoading(false);
      }
    };
    fetchProfile();
  }, []);

  // 设置浏览器标签
  useEffect(() => {
    if (siteConfig?.title) {
      document.title = siteConfig.title;
    } else if (profile?.name) {
      document.title = `${profile.name}'s Status`;
    } else {
      document.title = 'Status Page';
    }
  }, [siteConfig, profile]);


  // 卡片基础样式类
  const cardClass = `
    rounded-2xl 
    ${isLowPowerMode ? 'bg-white border-slate-200' : 'bg-white/80 backdrop-blur-md border-white/60'} 
    border shadow-sm p-6 transition-all duration-300 hover:shadow-md
  `;

  return (
    <DeviceStatusProvider>
      <div className="min-h-screen font-sans text-slate-800 relative overflow-x-hidden selection:bg-indigo-100 selection:text-indigo-900 bg-slate-50">
      
      {/* 弹窗组件 */}
      {activeDeviceDetail === 'pc' && (
        <DeviceDetailModal deviceId="pc" onClose={() => setActiveDeviceDetail(null)} t={t} />
      )}
      {activeDeviceDetail === 'mobile' && (
        <DeviceDetailModal deviceId="mobile" onClose={() => setActiveDeviceDetail(null)} t={t} />
      )}

      {/* 背景层 */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center transition-opacity duration-700"
        style={{ 
          backgroundImage: `url(${(profile || MOCK_DATA.profile).bgImage})`,
          display: isLowPowerMode ? 'none' : 'block'
        }}
      />
      <div 
        className="fixed inset-0 z-0 transition-colors duration-500"
        style={{
          backgroundColor: isLowPowerMode ? 'rgb(241, 245, 249)' : `rgba(255, 255, 255, ${bgOpacity})`
        }}
      />

      {/* 主内容容器 */}
      <div className="relative z-10 container mx-auto px-4 py-6 lg:py-10 max-w-6xl">
        
        {/* 顶部导航栏 - 移动端 */}
        <div className="flex justify-between items-center mb-6 lg:hidden">
          <div className="flex items-center space-x-2 bg-white/90 px-3 py-1.5 rounded-full shadow-sm border border-slate-100 backdrop-blur-sm">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            {profile ? (
              <span className="font-bold text-sm text-slate-700">{profile.name}</span>
            ) : (
              <div className="h-4 w-16 bg-slate-200 rounded animate-pulse" />
            )}
          </div>
          <div className="flex gap-2">
            <button 
              onClick={toggleLanguage}
              className="p-2 bg-white/90 rounded-full shadow-sm active:scale-95 transition-transform backdrop-blur-sm"
            >
              <Languages size={20} />
            </button>
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 bg-white/90 rounded-full shadow-sm active:scale-95 transition-transform backdrop-blur-sm"
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* 移动端菜单 */}
        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsMobileMenuOpen(false)}>
            <div 
              className="absolute top-0 right-0 h-full w-72 bg-white/95 backdrop-blur-xl shadow-2xl animate-in slide-in-from-right duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-bold text-slate-800">{t.headers.system}</h3>
                  <button 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-2 rounded-full hover:bg-slate-100 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      toggleLanguage();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                  >
                    <Languages size={22} className="text-indigo-500" />
                    <span className="font-semibold text-slate-700">
                      {lang === 'zh' ? 'Switch to English' : '切换到中文'}
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setIsLowPowerMode(!isLowPowerMode);
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                  >
                    <Settings size={22} className="text-indigo-500" />
                    <span className="font-semibold text-slate-700">
                      {isLowPowerMode ? t.system.performanceMode : t.system.lowPowerMode}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 桌面端右上角操作区 */}
        <div className="hidden lg:flex justify-end mb-6 gap-3">
          <button 
            onClick={toggleLanguage}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/80 backdrop-blur-md rounded-full shadow-sm border border-white/60 hover:bg-white hover:shadow-md transition-all text-sm font-semibold text-slate-700"
          >
            <Languages size={16} />
            {lang === 'zh' ? 'EN' : '中'}
          </button>
        </div>

        {/* 核心布局结构优化 */}
        <div className="space-y-6 lg:space-y-8">
          
          {/* 1. 顶部：个人资料卡片 (全宽展示) */}
          <ProfileCard 
            cardClass={cardClass}
            t={t}
            avatarError={avatarError}
            setAvatarError={setAvatarError}
            profile={profile}
            loading={profileLoading}
            error={profileError}
          />

          {/* 2. 下部：双栏布局 (左侧主要内容，右侧小组件) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            
            {/* 左侧主要区域 (占比 2/3) */}
            <div className="lg:col-span-8 space-y-6 lg:space-y-8">
              {/* 设备概况 */}
              <DeviceOverviewCard 
                cardClass={cardClass}
                t={t}
                lang={lang}
                onViewDetails={setActiveDeviceDetail}
              />

              {/* 游戏状态 */}
              <GameStatusCard
                cardClass={cardClass}
                t={t}
                activeGameCard={activeGameCard}
                setActiveGameCard={setActiveGameCard}
              />
            </div>

            {/* 右侧边栏 (占比 1/3) */}
            <div className="lg:col-span-4 space-y-6">
              {/* 天气卡片 */}
              <WeatherCard cardClass={cardClass} t={t} lang={lang} />
              
              {/* 此处已移除 HealthCard。
                 留白空间未来可以放置 日历/时钟/音乐播放器 等组件。
                 目前的单栏天气显示会更加清爽。
              */}
            </div>
          </div>
        </div>
        
        {/* 页脚 */}
        <footer className="mt-12 text-center text-slate-400 text-xs pb-6 opacity-80 hover:opacity-100 transition-opacity">
          <a 
            href="https://github.com/Reas0n-clw/Re_status" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-indigo-500 transition-colors cursor-pointer"
          >
            {t.system.footer}
          </a>
        </footer>
      </div>

      {/* 悬浮设置按钮 */}
      <div className="fixed bottom-8 right-8 z-50">
        {/* 设置面板 */}
        {isSettingsOpen && (
          <div 
            className="absolute bottom-full right-0 mb-4 w-72 bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-5 animate-in fade-in zoom-in-95 duration-200 origin-bottom-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-slate-800">{t.system.settings}</h3>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* 背景透明度滑动条 */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                {t.system.backgroundOpacity}
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={bgOpacity}
                  onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
                  disabled={isLowPowerMode}
                  className={`flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer slider transition-opacity ${
                    isLowPowerMode ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  style={{
                    background: `linear-gradient(to right, rgb(99, 102, 241) 0%, rgb(99, 102, 241) ${bgOpacity * 100}%, rgb(226, 232, 240) ${bgOpacity * 100}%, rgb(226, 232, 240) 100%)`
                  }}
                />
                <span className={`text-xs font-mono font-bold w-10 text-right ${
                  isLowPowerMode ? 'text-slate-400' : 'text-indigo-600'
                }`}>
                  {Math.round(bgOpacity * 100)}%
                </span>
              </div>
              {isLowPowerMode && (
                <p className="text-[10px] text-orange-500 flex items-center gap-1 mt-1 bg-orange-50 p-2 rounded-lg">
                  <Settings size={10} />
                  {lang === 'zh' ? '低功耗模式下背景已禁用' : 'Background disabled in low power mode'}
                </p>
              )}
            </div>
          </div>
        )}
        
        {/* 设置按钮 */}
        <button 
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          className={`p-4 rounded-full shadow-xl border transition-all hover:scale-105 active:scale-95 ${
            isLowPowerMode ? 'bg-slate-800 text-white border-slate-700' : 'bg-white text-slate-700 border-white/50'
          } ${isSettingsOpen ? 'ring-4 ring-indigo-200' : ''}`}
          title={t.system.settings}
        >
          <Settings size={24} />
        </button>
      </div>
      
      {/* 点击外部关闭设置面板 */}
      {isSettingsOpen && (
        <div 
          className="fixed inset-0 z-40"
          onClick={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
    </DeviceStatusProvider>
  );
};

export default App;
