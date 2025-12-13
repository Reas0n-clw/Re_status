/**
 * Bilibili 图标组件
 */
const BilibiliIcon = ({ size = 20, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <rect x="3" y="6" width="18" height="14" rx="2" />
    <path d="M8 3l2 3" />
    <path d="M16 3l-2 3" />
    <path d="M9 13h.01" />
    <path d="M15 13h.01" />
  </svg>
);

export default BilibiliIcon;

