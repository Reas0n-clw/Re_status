import { GAME_CARDS } from '../../../constants/gameCards';

/**
 * 空状态组件（用于未实现的平台）
 */
const EmptyState = ({ activeCardId }) => {
  const card = GAME_CARDS.find(c => c.id === activeCardId);
  
  if (!card) return null;

  return (
    <div className="flex flex-col items-center justify-center h-48 animate-in fade-in duration-300">
      <div className={`p-4 rounded-full bg-slate-50 mb-3 ${card.color}`}>
        {card.icon({ size: 24 })}
      </div>
      <p className="text-slate-500 font-medium">即将接入 {card.label} 数据...</p>
      <p className="text-xs text-slate-400 mt-1">API Integration Pending</p>
    </div>
  );
};

export default EmptyState;

