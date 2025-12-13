import { Gamepad2, Github, Music } from 'lucide-react';
import { BilibiliIcon, DiscordIcon } from '../components/ui/Icons';

/**
 * 支持的卡片类型及配置
 * 注意：icon 是函数，返回 React 元素
 */
export const GAME_CARDS = [
  { id: 'steam', icon: (props) => <Gamepad2 {...props} />, label: 'Steam', color: 'text-slate-700' },
  { id: 'bilibili', icon: (props) => <BilibiliIcon {...props} />, label: 'Bilibili', color: 'text-pink-400' },
  { id: 'github', icon: (props) => <Github {...props} />, label: 'GitHub', color: 'text-slate-800' },
  { id: 'discord', icon: (props) => <DiscordIcon {...props} />, label: 'Discord', color: 'text-indigo-500' },
  { id: 'spotify', icon: (props) => <Music {...props} />, label: 'Spotify', color: 'text-green-500' },
];

