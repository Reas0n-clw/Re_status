# 后端服务说明

Express 构建的 API 与静态资源服务，负责状态查询、设备上报、文件上传及 WebSocket 推送。生产环境直接托管前端构建产物（`dist`）。

核心环境变量（写入 `.env`）：
- `PORT`：服务端口，默认 `3000`
- `HOST`：监听地址，默认 `0.0.0.0`
- `API_KEY`：必填，用于设备上报认证
- `REQUIRE_API_KEY`：是否强制校验 API 密钥，默认 `true`

`API_KEY` 必须与采集器保持一致，否则上报将被拒绝。

## 运行

- 开发模式：`npm run dev`
- 生产模式：`npm start`

默认监听 `http://0.0.0.0:3000`，前端会自动适配访问地址。

## API 总览

- `GET /api/health`
- `GET /api/status/steam | /bilibili | /weather | /device`
- `POST /api/report/device`（需 `X-API-Key`）
- `WebSocket /ws`：实时设备状态推送
- `GET /api/usage/today`、`GET /api/stats/today`
- `GET /api/config/platforms`、`GET/PUT /api/profile`、`POST /api/profile/upload`

### 请求示例

设备上报：
```json
{
  "type": "status",
  "deviceType": "pc",
  "deviceId": "设备ID",
  "status": "online",
  "currentApp": { "name": "应用名", "title": "窗口标题" },
  "duration": 10000
}
```

批量使用记录：
```json
{
  "usageRecords": [
    {
      "deviceId": "PC-ComputerName",
      "deviceType": "pc",
      "appName": "Code.exe",
      "windowTitle": "Visual Studio Code",
      "startTime": "2024-01-01T10:00:00.000Z",
      "endTime": "2024-01-01T10:05:00.000Z",
      "duration": 300000
    }
  ]
}
```

## 数据存储

- 设备状态：`backend/data/device-status.json`
- 今日统计：`backend/data/today-stats.json`
- 使用记录：内存缓存，保留最近 7 天，最多 1000 条

## 部署提示

- 不要提交 `.env` 及含凭据的配置文件
- 生产环境请配合 HTTPS/反向代理
- 可使用 PM2 或 systemd 管理进程

## 关联文档

- `API_USAGE.md`：统计接口说明
- `QWEATHER_SETUP.md`：和风天气配置
- `../CONFIG_GUIDE.md`：全局配置指南

