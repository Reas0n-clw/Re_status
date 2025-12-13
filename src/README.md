# 前端说明

React + Vite 前端，负责状态卡片展示与自动地址适配。组件与 Hook 已按功能拆分，方便复用与扩展。

## 目录速览

```
src/
├── components/      # 卡片、图标、弹窗、UI 组件
├── hooks/           # 数据获取与状态管理 Hooks
├── contexts/        # Context 提供器
├── config/          # 默认平台配置
├── constants/       # 常量与枚举
├── data/            # i18n 与 mock 数据
├── utils/           # 工具函数
└── App.jsx          # 入口组件
```

## 数据与降级策略

- 所有 Hooks 都支持自动适配 API 地址（可通过 `VITE_API_BASE_URL` 覆盖）
- 请求失败会回退到 `src/data/mock.js`，保证页面可见
- WebSocket `/ws` 自动匹配当前访问地址

## 常用导入示例

- 卡片组件：
  ```jsx
  import { ProfileCard, DeviceOverviewCard, GameStatusCard, WeatherCard } from './components/cards';
  ```
- Hooks：
  ```jsx
  import { useStatusData, useDeviceStatus, useAppUsage } from './hooks';
  ```
- 配置与常量：
  ```jsx
  import { GAME_CARDS } from './constants/gameCards';
  import { TRANSLATIONS } from './data/i18n';
  ```

## 注意

- 平台开关及默认值在 `src/config/platforms.js`，实际配置以后端 `config/platforms.json` 为准
