import { Play, Loader2, AlertCircle } from 'lucide-react';
import { useStatusData } from '../../../hooks/useStatusData';

/**
 * Steam 内容组件
 * 通过 Steam 32位ID 从后端API获取真实数据
 */
const SteamContent = ({ t }) => {
  // 从API获取Steam数据，每60秒自动刷新（后端轮询节奏）
  const { data, loading, error } = useStatusData('steam', {
    refreshInterval: 60000 // 60秒刷新一次，与后端轮询同步
  });

  // 首次加载状态（只在没有数据时显示）
  if (loading && !data) {
    return (
      <div className="animate-in fade-in slide-in-from-right-4 duration-300 flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 size={32} className="animate-spin" />
          <p className="text-sm">{t.system.loading || '加载中...'}</p>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error || !data) {
    // 根据错误类型显示不同的提示
    let errorMessage = t.system.error || '无法获取数据';
    
    if (error) {
      if (typeof error === 'object' && error.code) {
        // 后端返回的结构化错误
        if (error.code === 'NOT_CONFIGURED') {
          errorMessage = t.system.apiNotConfigured || '未配置API';
        } else if (error.code === 'API_REQUEST_FAILED' || error.code === 'INVALID_STEAM_ID') {
          errorMessage = t.system.apiRequestFailed || 'API请求失败';
        } else {
          errorMessage = error.message || t.system.error || '无法获取数据';
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
    }
    
    return (
      <div className="animate-in fade-in slide-in-from-right-4 duration-300 flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <AlertCircle size={32} />
          <p className="text-sm">{errorMessage}</p>
        </div>
      </div>
    );
  }

  const profile = data?.profile || {};
  const recentGames = data?.recentGames || [];
  
  // 生成Steam社区主页链接
  const steamProfileUrl = profile.steamId64 
    ? `https://steamcommunity.com/profiles/${profile.steamId64}`
    : null;

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex gap-4 items-start">
        <div className="relative">
          {steamProfileUrl ? (
            <a 
              href={steamProfileUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="block cursor-pointer hover:opacity-80 transition-opacity"
              title="点击查看Steam个人资料"
            >
              <img 
                src={profile.avatar || 'https://api.dicebear.com/9.x/avataaars/svg?seed=Steam&backgroundColor=1e293b'} 
                className="w-16 h-16 rounded border-2 border-slate-300 shadow-sm" 
                alt="Steam Avatar"
                onError={(e) => {
                  e.target.src = 'https://api.dicebear.com/9.x/avataaars/svg?seed=Steam&backgroundColor=1e293b';
                }}
              />
            </a>
          ) : (
            <img 
              src={profile.avatar || 'https://api.dicebear.com/9.x/avataaars/svg?seed=Steam&backgroundColor=1e293b'} 
              className="w-16 h-16 rounded border-2 border-slate-300 shadow-sm" 
              alt="Steam Avatar"
              onError={(e) => {
                e.target.src = 'https://api.dicebear.com/9.x/avataaars/svg?seed=Steam&backgroundColor=1e293b';
              }}
            />
          )}
          {(() => {
            // 根据状态确定圆点颜色
            // personastate: 0=离线, 1=在线, 2=忙碌, 3=离开, 4=打盹, 5=想交易, 6=想玩游戏
            let dotColor = 'bg-slate-400'; // 默认灰色（离线）
            
            if (profile.status === 'in-game') {
              // 游戏中：绿色
              dotColor = 'bg-green-500';
            } else if (profile.personastate === 1) {
              // 在线：绿色
              dotColor = 'bg-green-500';
            } else if (profile.personastate === 2 || profile.personastate === 3) {
              // 忙碌(2)或离开(3)：橙色
              dotColor = 'bg-orange-500';
            } else if (profile.personastate === 4) {
              // 打盹(4)：红色（请勿打扰）
              dotColor = 'bg-red-500';
            } else if (profile.personastate === 5 || profile.personastate === 6) {
              // 想交易(5)或想玩游戏(6)：蓝色
              dotColor = 'bg-blue-500';
            } else if (profile.personastate === 0) {
              // 离线：灰色
              dotColor = 'bg-slate-400';
            }
            
            return (
              <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${dotColor}`}></div>
            );
          })()}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            {steamProfileUrl ? (
              <a 
                href={steamProfileUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="font-bold text-lg text-slate-800 hover:text-blue-600 transition-colors cursor-pointer"
                title="点击查看Steam个人资料"
              >
                {profile.name || 'Unknown'}
              </a>
            ) : (
              <h3 className="font-bold text-lg text-slate-800">{profile.name || 'Unknown'}</h3>
            )}
            {profile.level && profile.level > 0 && (
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                Lv.{profile.level}
              </span>
            )}
          </div>
          <p className={`text-sm font-medium ${profile.status === 'online' ? 'text-blue-500' : 'text-slate-500'}`}>
            {profile.statusText || (profile.status === 'online' ? t.status.online : t.status.offline)}
          </p>
          
          {/* 当前正在玩的游戏 */}
          {profile.game && (
            <div className="mt-3">
              {profile.gameId ? (
                <a
                  href={`https://store.steampowered.com/app/${profile.gameId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-gradient-to-r from-slate-900 to-slate-800 rounded-lg p-3 text-white relative overflow-hidden group cursor-pointer hover:opacity-90 transition-opacity"
                  title="点击查看Steam商店页面"
                  style={{ pointerEvents: 'auto' }}
                >
                  {profile.gameCover && (
                    <div className="absolute inset-0 opacity-40 bg-center bg-cover pointer-events-none" style={{backgroundImage: `url(${profile.gameCover})`}}></div>
                  )}
                  <div className="relative z-10 flex items-center gap-3 pointer-events-none">
                    {/* 游戏图标 */}
                    {profile.gameIcon && (
                      <div className="flex-shrink-0">
                        <img 
                          src={profile.gameIcon} 
                          alt={profile.game}
                          className="w-16 h-16 rounded border border-slate-600 shadow-lg object-cover"
                          onError={(e) => {
                            // 如果图标加载失败，尝试使用封面图
                            if (profile.gameCover) {
                              e.target.src = profile.gameCover;
                            } else {
                              e.target.style.display = 'none';
                            }
                          }}
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                        <Play size={10} fill="currentColor" /> {t.steam.playing}
                      </div>
                      <div className="font-bold text-base shadow-black drop-shadow-md truncate">{profile.game}</div>
                    </div>
                    {profile.playtimeTwoWeeks && profile.playtimeTwoWeeks !== '0h' && (
                      <div className="text-right ml-3 flex-shrink-0">
                        <div className="text-xs text-slate-300">{t.steam.totalPlaytime}</div>
                        <div className="font-mono font-bold">{profile.playtimeTwoWeeks}</div>
                      </div>
                    )}
                  </div>
                </a>
              ) : (
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-lg p-3 text-white relative overflow-hidden group">
                  {profile.gameCover && (
                    <div className="absolute inset-0 opacity-40 bg-center bg-cover" style={{backgroundImage: `url(${profile.gameCover})`}}></div>
                  )}
                  <div className="relative z-10 flex items-center gap-3">
                    {/* 游戏图标 */}
                    {profile.gameIcon && (
                      <div className="flex-shrink-0">
                        <img 
                          src={profile.gameIcon} 
                          alt={profile.game}
                          className="w-16 h-16 rounded border border-slate-600 shadow-lg object-cover"
                          onError={(e) => {
                            // 如果图标加载失败，尝试使用封面图
                            if (profile.gameCover) {
                              e.target.src = profile.gameCover;
                            } else {
                              e.target.style.display = 'none';
                            }
                          }}
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                        <Play size={10} fill="currentColor" /> {t.steam.playing}
                      </div>
                      <div className="font-bold text-base shadow-black drop-shadow-md truncate">{profile.game}</div>
                    </div>
                    {profile.playtimeTwoWeeks && profile.playtimeTwoWeeks !== '0h' && (
                      <div className="text-right ml-3 flex-shrink-0">
                        <div className="text-xs text-slate-300">{t.steam.totalPlaytime}</div>
                        <div className="font-mono font-bold">{profile.playtimeTwoWeeks}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 近期游戏列表 */}
      {recentGames.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{t.steam.games}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {recentGames.map((game, i) => {
              // 生成 Steam 商店链接
              const steamStoreUrl = game.appid 
                ? `https://store.steampowered.com/app/${game.appid}/`
                : null;
              
              // 游戏卡片内容（共用部分）
              const gameCardContent = (
                <>
                  {game.cover ? (
                    <img 
                      src={game.cover} 
                      alt={game.name || 'Game'}
                      className="w-12 h-12 rounded border border-slate-200 shadow-sm object-cover flex-shrink-0"
                      onError={(e) => {
                        // 如果图标加载失败，显示默认图标
                        e.target.style.display = 'none';
                        const parent = e.target.parentElement;
                        if (parent && !parent.querySelector('.fallback-icon')) {
                          const fallback = document.createElement('span');
                          fallback.className = 'fallback-icon text-lg';
                          fallback.textContent = '🎮';
                          parent.insertBefore(fallback, parent.firstChild);
                        }
                      }}
                    />
                  ) : (
                    <span className="text-lg flex-shrink-0">{game.icon || '🎮'}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-700 truncate">{game.name || 'Unknown Game'}</div>
                    <div className="text-[10px] text-slate-400">{game.time || '0h'}</div>
                  </div>
                </>
              );
              
              // 如果有 appid，包裹在链接中并添加 hover 效果；否则直接渲染
              return steamStoreUrl ? (
                <a
                  key={i}
                  href={steamStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block no-underline cursor-pointer hover:-translate-y-1 hover:shadow-lg transition-all duration-200 group"
                  title={`点击查看 ${game.name || '游戏'} 的 Steam 商店页面`}
                >
                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 flex items-center gap-2 transition-all duration-200 group-hover:bg-slate-100 group-hover:border-blue-400/50">
                    {gameCardContent}
                  </div>
                </a>
              ) : (
                <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-2 flex items-center gap-2">
                  {gameCardContent}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SteamContent;

