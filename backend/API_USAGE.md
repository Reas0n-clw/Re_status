# 应用使用统计 API 文档

## GET /api/usage/today

获取今日应用使用统计（Top 10）

### 请求参数

- `deviceType` (可选): 设备类型，`pc` 或 `mobile`，默认为 `pc`
- `deviceId` (可选): 设备ID，如果提供则精确匹配设备

### 响应格式

```json
{
  "success": true,
  "data": [
    {
      "name": "Code.exe",
      "time": "2h 30m",
      "duration": 9000000,
      "count": 15,
      "icon": "💻",
      "category": "Unknown",
      "percent": 45
    },
    ...
  ],
  "totalDuration": "5h 20m",
  "recordCount": 50,
  "timestamp": "2024-01-01T10:00:00.000Z"
}
```

### 数据说明

- `name`: 应用名称
- `time`: 格式化后的使用时长（如 "2h 30m"）
- `duration`: 使用时长（毫秒）
- `count`: 使用次数
- `icon`: 应用图标（默认 💻）
- `category`: 应用分类（默认 "Unknown"）
- `percent`: 占总时长的百分比

### 示例

```bash
# 获取 PC 设备今日统计
curl http://localhost:3000/api/usage/today?deviceType=pc

# 获取指定设备今日统计
curl http://localhost:3000/api/usage/today?deviceId=PC-ComputerName
```

## 数据存储

使用记录保存在 `backend/data/usage.json` 文件中：
- 自动保留最近7天的记录
- 最多保留1000条记录
- 数据格式：JSON 数组

## 数据流程

1. 采集器上报使用记录 → `POST /api/report/device`
2. 后端保存到 `usage.json` 文件
3. 前端请求统计 → `GET /api/usage/today`
4. 后端聚合计算并返回 Top 10




