import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * 一言组件
 * 支持打字机效果、点击刷新、防抖处理
 */
const Hitokoto = () => {
  const [text, setText] = useState('');
  const [from, setFrom] = useState('');
  const [displayedText, setDisplayedText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const typingTimeoutRef = useRef(null);
  const debounceTimeoutRef = useRef(null);
  const displayedIndexRef = useRef(0);

  // 获取一言数据
  const fetchHitokoto = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('https://v1.hitokoto.cn/?c=a&c=b', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('请求失败');
      }

      const data = await response.json();
      setText(data.hitokoto || '保持热爱，奔赴山海。');
      setFrom(data.from || '未知');
      displayedIndexRef.current = 0;
      setDisplayedText('');
      setIsTyping(true);
    } catch (error) {
      console.error('[Hitokoto] 获取失败:', error);
      // 使用默认值
      setText('保持热爱，奔赴山海。');
      setFrom('默认');
      displayedIndexRef.current = 0;
      setDisplayedText('');
      setIsTyping(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 打字机效果
  useEffect(() => {
    if (!isTyping || !text) return;

    const typeNextChar = () => {
      if (displayedIndexRef.current < text.length) {
        setDisplayedText(text.substring(0, displayedIndexRef.current + 1));
        displayedIndexRef.current += 1;
        
        // 随机速度：50-150ms
        const speed = 50 + Math.random() * 100;
        typingTimeoutRef.current = setTimeout(typeNextChar, speed);
      } else {
        setIsTyping(false);
      }
    };

    typeNextChar();

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [isTyping, text]);

  // 初始加载
  useEffect(() => {
    fetchHitokoto();
  }, [fetchHitokoto]);

  // 点击刷新处理（带防抖）
  const handleClick = useCallback(() => {
    // 清除之前的防抖定时器
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // 如果正在刷新或正在打字，忽略点击
    if (isRefreshing || isTyping) {
      return;
    }

    // 设置防抖：500ms
    debounceTimeoutRef.current = setTimeout(() => {
      setIsRefreshing(true);
      
      // 清除打字机效果
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // 重新获取数据
      fetchHitokoto().finally(() => {
        setIsRefreshing(false);
      });
    }, 300);
  }, [isRefreshing, isTyping, fetchHitokoto]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // 加载状态
  if (isLoading && !displayedText) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-sm pt-1">
        <Loader2 size={14} className="animate-spin" />
        <span>加载中...</span>
      </div>
    );
  }

  return (
    <div 
      className="pt-1.5 cursor-pointer group transition-opacity hover:opacity-80"
      onClick={handleClick}
      title="点击刷新一言"
    >
      <div className="text-gray-500 text-sm leading-relaxed flex items-start flex-wrap">
        <span className="inline-block">
          {displayedText}
          {isTyping && (
            <span className="inline-block w-0.5 h-4 bg-gray-400 ml-1 animate-pulse align-middle" />
          )}
        </span>
        {!isTyping && displayedText && (
          <span className="text-gray-400 text-xs ml-2 mt-0.5 flex-shrink-0">
            —— {from}
          </span>
        )}
      </div>
      {isRefreshing && (
        <div className="flex items-center gap-2 text-gray-400 text-xs pt-1">
          <Loader2 size={12} className="animate-spin" />
          <span>刷新中...</span>
        </div>
      )}
    </div>
  );
};

export default Hitokoto;

