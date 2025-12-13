import { Play, Clock } from 'lucide-react';
import { MOCK_DATA } from '../../data/mock';

/**
 * Steam 卡片组件
 */
const SteamCard = ({ t }) => {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex gap-4 items-start">
        <div className="relative">
          <img src={MOCK_DATA.steam.profile.avatar} className="w-16 h-16 rounded border-2 border-slate-300 shadow-sm" alt="Steam Avatar" />
          <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${MOCK_DATA.steam.profile.status === 'online' ? 'bg-blue-400' : 'bg-slate-400'}`}></div>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-slate-800">{MOCK_DATA.steam.profile.name}</h3>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
              Lv.{MOCK_DATA.steam.profile.level}
            </span>
          </div>
          <p className={`text-sm font-medium ${MOCK_DATA.steam.profile.status === 'online' ? 'text-blue-500' : 'text-slate-500'}`}>
            {MOCK_DATA.steam.profile.statusText}
          </p>
          
          {/* 当前正在玩的游戏 */}
          <div className="mt-3 bg-gradient-to-r from-slate-900 to-slate-800 rounded-lg p-3 text-white relative overflow-hidden group">
            <div className="absolute inset-0 opacity-40 bg-center bg-cover" style={{backgroundImage: `url(${MOCK_DATA.steam.profile.gameCover})`}}></div>
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                  <Play size={10} fill="currentColor" /> {t.steam.playing}
                </div>
                <div className="font-bold text-base shadow-black drop-shadow-md">{MOCK_DATA.steam.profile.game}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-300">{t.steam.totalPlaytime}</div>
                <div className="font-mono font-bold">{MOCK_DATA.steam.profile.playtimeTwoWeeks}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 近期游戏列表 */}
      <div className="mt-4 pt-4 border-t border-slate-200">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t.steam.games}</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {MOCK_DATA.steam.recentGames.map((game, i) => (
            <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-2 flex items-center gap-2 hover:bg-slate-100 transition-colors">
              <span className="text-lg">{game.icon}</span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-700 truncate">{game.name}</div>
                <div className="text-[10px] text-slate-400">{game.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SteamCard;

