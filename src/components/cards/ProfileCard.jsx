import { MapPin, User } from 'lucide-react';
import Hitokoto from '../Hitokoto';

/**
 * 个人资料卡片组件
 * 优化版：移除了健康数据，仅保留核心个人信息
 */
const ProfileCard = ({ cardClass, t, avatarError, setAvatarError, profile, loading = false, error = null }) => {
  // 如果没有数据（loading、error 或 profile 为 null），显示骨架屏
  const hasData = profile && !loading;

  return (
    <header className={`${cardClass} flex flex-col sm:flex-row items-center sm:items-start gap-6`}>
      {/* 头像区域 */}
      <div className="relative shrink-0">
        {hasData ? (
          <>
            {avatarError ? (
              <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-full border-4 border-white shadow-md bg-indigo-100 flex items-center justify-center text-indigo-400">
                <User size={40} />
              </div>
            ) : (
              <img 
                src={profile.avatar} 
                alt="Avatar" 
                className="w-20 h-20 lg:w-24 lg:h-24 rounded-full border-4 border-white shadow-md bg-indigo-50 object-cover"
                onError={() => setAvatarError(true)}
              />
            )}
            <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full border-4 border-white bg-green-500 ring-2 ring-white" />
          </>
        ) : (
          <>
            {/* 骨架屏：灰色圆形占位符 */}
            <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-full border-4 border-white shadow-md bg-slate-200 animate-pulse" />
          </>
        )}
      </div>
      
      {/* 信息区域 */}
      <div className="flex-1 text-center sm:text-left space-y-2 pt-1">
        {/* 昵称和状态 */}
        <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
          {hasData ? (
            <>
              <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">
                {profile.name}
              </h1>
              <span className="px-2.5 py-0.5 text-xs font-bold bg-green-100 text-green-700 rounded-full border border-green-200/50 uppercase tracking-wide">
                {t.status.online}
              </span>
            </>
          ) : (
            <>
              {/* 骨架屏：昵称 */}
              <div className="h-9 w-48 bg-slate-200 rounded-lg animate-pulse" />
            </>
          )}
        </div>
        
        {/* 一言组件 - 只在有数据时显示 */}
        {hasData && <Hitokoto />}
        
        {/* 位置信息 */}
        {hasData ? (
          <div className="text-slate-500 text-sm flex items-center justify-center sm:justify-start gap-2">
            <MapPin size={15} className="text-indigo-500" /> 
            <span className="font-medium">{profile.location}</span>
          </div>
        ) : (
          <div className="pt-2 flex items-center justify-center sm:justify-start">
            {/* 骨架屏：位置信息 */}
            <div className="h-5 w-32 bg-slate-200 rounded animate-pulse" />
          </div>
        )}
      </div>
    </header>
  );
};

export default ProfileCard;
