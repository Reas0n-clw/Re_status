# Windows 数据采集客户端

Node.js 程序，用于采集 Windows 前台应用与使用时长，并定期批量上报到后端。支持隐藏运行与开机自启。

## 快速开始

```bash
cd data-collectors/windows-collector
npm install
cp env.example .env   # 填写 API_BASE_URL / API_KEY
```

关键配置（`.env`）：
- `API_BASE_URL`：后端地址，默认 `http://localhost:3000`
- `API_KEY`：必填，需与后端一致
- `POLL_INTERVAL`、`UPLOAD_INTERVAL`：轮询与上传间隔
- `DEVICE_ID`、`DEVICE_NAME`：可选自定义

## 运行方式

- 直接运行：`start.bat`
- 隐藏后台：`start.bat silent`
- 开机自启并隐藏后台：reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "MyHiddenBat" /t REG_SZ /d "mshta vbscript:CreateObject(\"WScript.Shell\").Run(\"cmd /c \"\"%cd%\start.bat\"\"\",0)(window.close)" /f

## 数据格式

使用记录示例：
```json
{
  "deviceId": "PC-ComputerName",
  "deviceType": "pc",
  "appName": "Code.exe",
  "windowTitle": "Visual Studio Code",
  "startTime": "2024-01-01T10:00:00.000Z",
  "endTime": "2024-01-01T10:05:00.000Z",
  "duration": 300000
}
```

设备状态示例：
```json
{
  "type": "status",
  "deviceType": "pc",
  "deviceId": "PC-ComputerName",
  "deviceName": "My Workstation",
  "status": "online",
  "currentApp": { "name": "Code.exe", "title": "Visual Studio Code" },
  "duration": 10000
}
```

## 注意事项

- 必须填写 `API_KEY`，且与后端匹配
- 安装/卸载开机自启需要管理员权限
- 数据缓存在 `data/usage.json`，最多保留 7 天/1000 条
- 端口占用可通过 `start.bat`/`start.ps1` 内置检查解决

