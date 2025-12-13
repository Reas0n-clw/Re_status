import { Loader2, AlertCircle, Clock, User } from 'lucide-react';
import { useStatusData } from '../../../hooks/useStatusData';

/**
 * Bilibili 内容组件
 * 通过 Bilibili UID 从后端API获取真实数据
 */
const BilibiliContent = ({ t }) => {
  // 从API获取Bilibili数据，每30秒自动刷新
  const { data, loading, error } = useStatusData('bilibili', {
    refreshInterval: 30000 // 30秒刷新一次
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
          errorMessage = '未填入UID';
        } else if (error.code === 'API_REQUEST_FAILED') {
          errorMessage = '数据获取失败';
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
  const videos = data?.latestVideos || [];
  const favorites = data?.favorites || [];

  const avatarUrl = profile.avatar && profile.avatar.trim() && profile.avatar !== 'null' 
    ? profile.avatar 
    : 'https://api.dicebear.com/9.x/avataaars/svg?seed=Bilibili&backgroundColor=ffafc9';

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex gap-4 items-start">
        <div className="relative">
          {profile.uid ? (
            <a
              href={`https://space.bilibili.com/${profile.uid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block cursor-pointer hover:opacity-80 transition-opacity"
              title="点击访问 Bilibili 主页"
            >
              <img 
                key={avatarUrl} // 添加key强制重新渲染
                src={avatarUrl} 
                className="w-16 h-16 rounded-full border-2 border-pink-200 shadow-sm" 
                alt="Bilibili Avatar"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                onError={(e) => {
                  console.error('[BilibiliContent] 头像加载失败');
                  console.error('[BilibiliContent] 原始profile.avatar:', profile.avatar);
                  console.error('[BilibiliContent] 尝试加载的URL:', e.target.src);
                  // 只有在不是默认头像时才替换
                  if (!e.target.src.includes('dicebear')) {
                    e.target.src = 'https://api.dicebear.com/9.x/avataaars/svg?seed=Bilibili&backgroundColor=ffafc9';
                  }
                }}
                onLoad={() => {}}
              />
            </a>
          ) : (
            <img 
              key={avatarUrl} // 添加key强制重新渲染
              src={avatarUrl} 
              className="w-16 h-16 rounded-full border-2 border-pink-200 shadow-sm" 
              alt="Bilibili Avatar"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
              onError={(e) => {
                console.error('[BilibiliContent] 头像加载失败');
                console.error('[BilibiliContent] 原始profile.avatar:', profile.avatar);
                console.error('[BilibiliContent] 尝试加载的URL:', e.target.src);
                // 只有在不是默认头像时才替换
                if (!e.target.src.includes('dicebear')) {
                  e.target.src = 'https://api.dicebear.com/9.x/avataaars/svg?seed=Bilibili&backgroundColor=ffafc9';
                }
              }}
              onLoad={() => {
                console.log('[BilibiliContent] 头像加载成功:', avatarUrl);
              }}
            />
          )}
          {profile.level && profile.level > 0 && (
            <div className="absolute bottom-0 right-0 bg-pink-400 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white">
              Lv{profile.level}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {profile.uid ? (
            <a
              href={`https://space.bilibili.com/${profile.uid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block cursor-pointer hover:text-pink-500 transition-colors"
              title="点击访问 Bilibili 主页"
            >
              <h3 className="font-bold text-lg text-slate-800">{profile.username || 'Unknown'}</h3>
            </a>
          ) : (
            <h3 className="font-bold text-lg text-slate-800">{profile.username || 'Unknown'}</h3>
          )}
          {profile.bio && (
            <p className="text-xs text-slate-500 line-clamp-1 mt-0.5 mb-2">{profile.bio}</p>
          )}
          <div className="flex gap-3 text-xs">
            {profile.uid ? (
              <a
                href={`https://space.bilibili.com/${profile.uid}/fans/fans`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-slate-600 hover:text-pink-500 transition-colors cursor-pointer"
                title="点击查看粉丝列表"
              >
                <span className="font-bold">{profile.followers || '0'}</span> 
                <span className="text-slate-400">{t.bilibili.followers}</span>
              </a>
            ) : (
              <div className="flex items-center gap-1 text-slate-600">
                <span className="font-bold">{profile.followers || '0'}</span> 
                <span className="text-slate-400">{t.bilibili.followers}</span>
              </div>
            )}
            {profile.uid ? (
              <a
                href={`https://space.bilibili.com/${profile.uid}/fans/follow`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-slate-600 hover:text-pink-500 transition-colors cursor-pointer"
                title="点击查看关注列表"
              >
                <span className="font-bold">{profile.following || '0'}</span> 
                <span className="text-slate-400">{t.bilibili.following}</span>
              </a>
            ) : (
              <div className="flex items-center gap-1 text-slate-600">
                <span className="font-bold">{profile.following || '0'}</span> 
                <span className="text-slate-400">{t.bilibili.following}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 近期动态 - 网格布局 */}
      {(() => {
        // 合并最新视频和收藏夹视频
        const recentActivities = [];
        
        // 添加最新视频（第一个）
        if (videos.length > 0 && videos[0].title !== '暂无视频') {
          recentActivities.push({
            ...videos[0],
            type: 'video',
            author: '我的投稿',
            date: videos[0].date || ''
          });
        }
        
        // 添加收藏夹中的前3个视频
        if (favorites.length > 0 && favorites[0].items) {
          favorites[0].items.slice(0, 3).forEach(item => {
            if (recentActivities.length < 4) {
              recentActivities.push({
                title: item.title,
                thumbnail: item.cover,
                bvid: item.bvid,
                type: 'favorite',
                author: item.author || '未知',
                date: ''
              });
            }
          });
        }
        
        // 如果还没有4个，用默认项填充
        while (recentActivities.length < 4) {
          recentActivities.push({
            title: '暂无内容',
            thumbnail: 'https://images.unsplash.com/photo-1544197150-b99a580bbc7c?q=80&w=600&auto=format&fit=crop',
            type: 'empty',
            author: '',
            date: ''
          });
        }
        
        return recentActivities.length > 0 ? (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">近期动态</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {recentActivities.slice(0, 4).map((item, i) => (
                <a
                  key={i}
                  href={item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-slate-50 border border-slate-100 rounded-lg p-2 hover:bg-slate-100 transition-colors group"
                  onClick={(e) => {
                    if (item.type === 'empty' || !item.bvid) {
                      e.preventDefault();
                    }
                  }}
                >
                  <div className="relative w-full aspect-video rounded overflow-hidden mb-1.5 bg-slate-200">
                    {item.thumbnail ? (
                      <img 
                        src={item.thumbnail} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        crossOrigin="anonymous"
                        onError={(e) => {
                          console.error('[BilibiliContent] 图片加载失败:', item.thumbnail);
                          e.target.src = 'https://images.unsplash.com/photo-1544197150-b99a580bbc7c?q=80&w=600&auto=format&fit=crop';
                        }}
                        onLoad={() => {}}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400 text-xs">
                        暂无图片
                      </div>
                    )}
                    {/* 封面角标 */}
                    {item.type === 'video' && (
                      <div className="absolute top-1 right-1 bg-[#FB7299] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm shadow-sm">
                        投稿
                      </div>
                    )}
                    {item.type === 'favorite' && (
                      <div className="absolute top-1 right-1 bg-[#23ADE5] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm shadow-sm">
                        收藏
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-xs font-bold truncate mb-0.5 transition-colors ${
                      item.type === 'video' 
                        ? 'text-[#FB7299] group-hover:text-[#ff85b3]' 
                        : 'text-slate-700 group-hover:text-pink-500'
                    }`}>
                      {item.title || '无标题'}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                      {item.type === 'video' && item.date ? (
                        <>
                          <Clock size={10} className="flex-shrink-0" />
                          <span>{item.date}</span>
                        </>
                      ) : item.type === 'favorite' && item.author ? (
                        <>
                          <User size={10} className="flex-shrink-0" />
                          <span>{item.author}</span>
                        </>
                      ) : (
                        <span className="text-slate-400">{item.author || item.date || ''}</span>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ) : null;
      })()}
    </div>
  );
};

export default BilibiliContent;

