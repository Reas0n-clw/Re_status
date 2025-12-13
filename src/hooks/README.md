# 数据获取 Hooks

封装常用状态获取与降级逻辑的 Hooks，默认自动适配 API 地址（可用 `VITE_API_BASE_URL` 覆盖）。

## useStatusData

- 获取单个平台状态：`steam` / `bilibili` / `weather`
- 自动降级到 `src/data/mock.js`，并暴露 `isUsingFallback`
- 支持定时刷新：`refreshInterval`

示例：
```jsx
const { data, loading, error, isUsingFallback, refetch } = useStatusData('steam');
```

## useDeviceStatus

- 获取设备列表，支持 WebSocket 自动更新
- 返回：`devices`、`loading`、`error`、`lastUpdate`

## useDeviceStatusWS

- 仅管理 WebSocket 连接，返回 `devices`、`connected`、`error`
- 可传入 `wsUrl` / `apiBaseUrl` 覆盖默认自动推断

## useAppUsage

- 获取应用使用排行
- 参数：`deviceType` (`pc`|`mobile`)，`deviceId`（可选）
- 返回：`data`、`loading`、`error`、`totalDuration`、`recordCount`

## 地址适配逻辑

1. 若设置 `VITE_API_BASE_URL`，优先使用
2. 否则使用浏览器当前地址，localhost 环境自动指向 `http://localhost:3000`
3. WebSocket 自动匹配协议/主机

