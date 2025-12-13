/**
 * 模拟数据源
 */
export const MOCK_DATA = {
  profile: {
    name: "User",
    status: "online", 
    location: "City, Country",
    avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=User&backgroundColor=ffdfbf",
    bgImage: "https://images.unsplash.com/photo-1518709414768-a88986a4555d?q=80&w=1200&auto=format&fit=crop" 
  },
  steam: {
    profile: {
      name: "User_Steam",
      avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=User&backgroundColor=1e293b",
      level: 1,
      status: "online", 
      game: "Game Name",
      gameCover: "https://images.unsplash.com/photo-1593305841991-05c29736560e?q=80&w=600&auto=format&fit=crop", 
      playtimeTwoWeeks: "0h",
      statusText: "Playing"
    },
    recentGames: [
      { name: "Game 1", time: "0h", icon: "🎮" },
      { name: "Game 2", time: "0h", icon: "🎮" },
      { name: "Game 3", time: "0h", icon: "🎮" }
    ]
  },
  bilibili: {
    profile: {
      username: "User_Bili",
      avatar: "https://api.dicebear.com/9.x/avataaars/svg?seed=User&backgroundColor=ffafc9",
      bio: "用户简介",
      level: 1,
      followers: "0",
      following: "0"
    },
    latestVideos: [
      { title: "视频标题", thumbnail: "https://images.unsplash.com/photo-1544197150-b99a580bbc7c?q=80&w=600&auto=format&fit=crop", date: "1天前" },
      { title: "视频标题", thumbnail: "https://images.unsplash.com/photo-1626379953822-baec19c3accd?q=80&w=600&auto=format&fit=crop", date: "1周前" }
    ]
  },
  deviceStatus: {
    pc: { 
      id: 'pc',
      name: "PC", 
      os: "Windows", 
      status: "online", 
      uptime: "0h 0m",
      currentApp: { name: "App", icon: "💻" }
    },
    mobile: { 
      id: 'mobile',
      name: "Mobile", 
      os: "Android", 
      status: "active",
      battery: 100, 
      isCharging: false,
      currentApp: { name: "App", icon: "📱" }
    }
  },
  detailedApps: {
    pc: [
      { name: "App 1", time: "0h 0m", percent: 0, icon: "💻", category: "Other" },
      { name: "App 2", time: "0h 0m", percent: 0, icon: "💻", category: "Other" },
      { name: "App 3", time: "0h 0m", percent: 0, icon: "💻", category: "Other" }
    ],
    mobile: [
      { name: "App 1", time: "0h 0m", percent: 0, icon: "📱", category: "Other" },
      { name: "App 2", time: "0h 0m", percent: 0, icon: "📱", category: "Other" },
      { name: "App 3", time: "0h 0m", percent: 0, icon: "📱", category: "Other" }
    ]
  },
  health: {
    heartRate: 72,
    sleep: "7h 30m",
    sleepScore: 88,
    heartHistory: [65, 68, 72, 75, 70, 68, 72]
  },
  weather: {
    temp: 24,
    condition: "Cloudy", 
    conditionZh: "多云",
    humidity: "65%",
    wind: "3级"
  },
  system: {
    cpu: "15%",
    mem: "420MB", 
    temp: "45°C"
  }
};

