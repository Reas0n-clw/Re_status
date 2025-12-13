import PlatformSwitcher from '../../PlatformSwitcher';
import SteamContent from './SteamContent';
import BilibiliContent from './BilibiliContent';
import EmptyState from './EmptyState';

/**
 * 游戏状态卡片组件
 */
const GameStatusCard = ({ 
  cardClass, 
  t, 
  activeGameCard, 
  setActiveGameCard
}) => {
  return (
    <section className={`${cardClass} relative overflow-hidden transition-all duration-300 min-h-[300px]`}>
      <div className="flex items-center justify-between mb-4 relative z-30">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-700">
          {t.headers.gameStatus}
        </h2>
        
        {/* 平台选择器 Dropdown */}
        <PlatformSwitcher 
          activeId={activeGameCard} 
          onSelect={setActiveGameCard} 
        />
      </div>

      {/* Steam 内容区域 */}
      {activeGameCard === 'steam' && <SteamContent t={t} />}

      {/* Bilibili 内容区域 */}
      {activeGameCard === 'bilibili' && <BilibiliContent t={t} />}

      {/* 空状态占位 (Github/Discord/Spotify) */}
      {(activeGameCard !== 'steam' && activeGameCard !== 'bilibili') && (
        <EmptyState activeCardId={activeGameCard} />
      )}
    </section>
  );
};

export default GameStatusCard;

