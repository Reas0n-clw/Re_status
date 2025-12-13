import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { GAME_CARDS } from '../../constants/gameCards';
import { isPlatformEnabled } from '../../config/platforms';

/**
 * 平台切换器组件
 * 只显示启用的平台
 */
const PlatformSwitcher = ({ activeId, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 过滤出启用的平台
  const enabledCards = GAME_CARDS.filter(card => isPlatformEnabled(card.id));
  const activeCard = enabledCards.find(c => c.id === activeId) || enabledCards[0];

  // 如果没有启用的平台，返回null
  if (enabledCards.length === 0) {
    return null;
  }

  return (
    <div className="relative z-20" ref={containerRef}>
      {/* 触发按钮 */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-white/80 hover:bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-sm transition-all active:scale-95"
      >
        <span className={activeCard.color}>{activeCard.icon({ size: 18 })}</span>
        <span className="text-sm font-bold text-slate-700">{activeCard.label}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white/95 backdrop-blur-xl border border-slate-100 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="p-1">
            {enabledCards.map(card => (
              <button
                key={card.id}
                onClick={() => {
                  onSelect(card.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  activeId === card.id 
                    ? 'bg-slate-100 font-bold text-slate-800' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className={card.color}>{card.icon({ size: 18 })}</span>
                {card.label}
                {activeId === card.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformSwitcher;

