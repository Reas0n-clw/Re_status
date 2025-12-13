import { AlertCircle } from 'lucide-react';
import PlatformSwitcher from '../ui/PlatformSwitcher';
import SteamContent from './gameStatus/SteamContent';
import BilibiliCard from './BilibiliCard';
import { GAME_CARDS } from '../../constants/gameCards';
import { isPlatformEnabled } from '../../config/platforms';

/**
 * 游戏状态卡片组件（容器）
 * 根据配置文件控制各平台的显示
 */
const GameStatusCard = ({ 
  cardClass, 
  t, 
  activeGameCard, 
  setActiveGameCard
}) => {
  return (
    <section className={`${cardClass} relative overflow-visible transition-all duration-300 min-h-[300px] flex flex-col`}>
      {/* 头部：标题和平台选择器 */}
      <div className="flex items-center justify-between mb-4 relative z-30 flex-shrink-0">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-700">
          {t.headers.gameStatus}
        </h2>
        
        {/* 平台选择器 Dropdown */}
        <PlatformSwitcher 
          activeId={activeGameCard} 
          onSelect={setActiveGameCard} 
        />
      </div>

      {/* 内容区域：使用 flex-1 允许自动撑开，并添加最小高度确保内容可见 */}
      <div className="flex-1 min-h-0">
        {/* Steam 内容区域 */}
        {activeGameCard === 'steam' && isPlatformEnabled('steam') && <SteamContent t={t} />}

        {/* Bilibili 内容区域 */}
        {activeGameCard === 'bilibili' && isPlatformEnabled('bilibili') && <BilibiliCard t={t} />}

        {/* 空状态占位 (Github/Discord/Spotify) */}
        {activeGameCard === 'github' && isPlatformEnabled('github') && (
          <div className="flex flex-col items-center justify-center min-h-[192px] animate-in fade-in duration-300">
            <div className={`p-4 rounded-full bg-slate-50 mb-3 ${GAME_CARDS.find(c => c.id === activeGameCard)?.color}`}>
              {GAME_CARDS.find(c => c.id === activeGameCard)?.icon({ size: 24 })}
            </div>
            <p className="text-slate-500 font-medium">即将接入 {GAME_CARDS.find(c => c.id === activeGameCard)?.label} 数据...</p>
            <p className="text-xs text-slate-400 mt-1">API Integration Pending</p>
          </div>
        )}

        {activeGameCard === 'discord' && isPlatformEnabled('discord') && (
          <div className="flex flex-col items-center justify-center min-h-[192px] animate-in fade-in duration-300">
            <div className={`p-4 rounded-full bg-slate-50 mb-3 ${GAME_CARDS.find(c => c.id === activeGameCard)?.color}`}>
              {GAME_CARDS.find(c => c.id === activeGameCard)?.icon({ size: 24 })}
            </div>
            <p className="text-slate-500 font-medium">即将接入 {GAME_CARDS.find(c => c.id === activeGameCard)?.label} 数据...</p>
            <p className="text-xs text-slate-400 mt-1">API Integration Pending</p>
          </div>
        )}

        {activeGameCard === 'spotify' && isPlatformEnabled('spotify') && (
          <div className="flex flex-col items-center justify-center min-h-[192px] animate-in fade-in duration-300">
            <div className={`p-4 rounded-full bg-slate-50 mb-3 ${GAME_CARDS.find(c => c.id === activeGameCard)?.color}`}>
              {GAME_CARDS.find(c => c.id === activeGameCard)?.icon({ size: 24 })}
            </div>
            <p className="text-slate-500 font-medium">即将接入 {GAME_CARDS.find(c => c.id === activeGameCard)?.label} 数据...</p>
            <p className="text-xs text-slate-400 mt-1">API Integration Pending</p>
          </div>
        )}

        {/* 如果当前选中的平台未启用，显示提示 */}
        {!isPlatformEnabled(activeGameCard) && (
          <div className="flex flex-col items-center justify-center min-h-[192px] animate-in fade-in duration-300">
            <div className="p-4 rounded-full bg-slate-50 mb-3 text-slate-400">
              <AlertCircle size={24} />
            </div>
            <p className="text-slate-500 font-medium">该平台已禁用</p>
            <p className="text-xs text-slate-400 mt-1">请在配置文件中启用此平台</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default GameStatusCard;

