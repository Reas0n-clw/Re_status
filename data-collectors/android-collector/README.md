# Android 数据采集客户端

Auto.js/AutoX.js 脚本，用于上报 Android 前台应用与设备状态。需与后端 `API_KEY` 一致。

## 快速开始

1. 安装 Auto.js 或 AutoX.js（推荐 AutoX.js）
2. 复制 `Restatus.js` 到手机并在应用中打开
3. 修改配置区域：
   ```javascript
   const CONFIG = {
     API_URL: "http://your-server:3000/api/report/device",
     API_KEY: "your_secret_key",
     DEVICE_ID: "mobile_01",
     DEVICE_NAME: device.model,
     INTERVAL: 5000
   };
   ```
4. 开启无障碍服务，加入电池优化白名单，运行脚本

## 上报示例

```json
{
  "type": "status",
  "deviceId": "mobile_01",
  "deviceName": "Xiaomi 12",
  "deviceType": "mobile",
  "status": "online",
  "battery": 85,
  "isCharging": false,
  "networkType": "Wifi",
  "currentApp": { "name": "微信", "packageName": "com.tencent.mm" },
  "duration": 5.2
}
```

## 注意事项

- `API_URL` 需为可访问的后端地址（不要使用 localhost/127.0.0.1）
- `API_KEY` 不能为空，且与后端保持一致
- 开启无障碍、白名单与自启动，避免脚本被系统杀死

## 故障排查

- 上报 401/403：检查 `API_KEY`
- 无法连接：确认后端运行、`API_URL` 指向正确、网络可达
- 频繁停止：检查电池优化、自启动权限

