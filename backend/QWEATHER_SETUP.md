# 和风天气服务配置指南

## 简介

和风天气服务提供了站长天气和访客天气查询功能，使用LRU缓存严格控制API请求次数，充分利用每月50,000次的免费额度。

## 功能特性

- ✅ **站长天气**：固定位置（Location ID），缓存30分钟
- ✅ **访客天气**：根据IP自动定位，缓存60分钟
- ✅ **智能缓存**：使用LRU缓存，减少API请求
- ✅ **错误处理**：完善的错误处理，不会导致服务崩溃
- ✅ **IP定位**：自动通过IP获取访客位置

## 配置步骤

### 1. 获取和风天气API密钥

1. 访问 [和风天气开发者平台](https://dev.qweather.com/)
2. 注册账号并登录
3. 创建应用，获取API Key
4. 免费版限制：
   - 每天1,000次请求
   - 每月50,000次请求

### 2. 获取Location ID

Location ID是城市的唯一标识符，用于查询固定位置的天气。

**方法一：使用城市搜索API**

```bash
curl "https://geoapi.qweather.com/v2/city/lookup?location=北京&key=YOUR_API_KEY"
```

**方法二：查看常用城市Location ID**

- 北京：`101010100`
- 上海：`101020100`
- 广州：`101280101`
- 深圳：`101280601`
- 杭州：`101210101`

更多城市Location ID请参考：[和风天气城市列表](https://github.com/qwd/LocationList)

### 3. 配置环境变量

在 `backend/.env` 文件中添加以下配置：

```env
# 和风天气API密钥
QWEATHER_KEY=your_api_key_here

# 站长位置Location ID（例如：北京 = 101010100）
OWNER_LOCATION_ID=101010100

# 站长城市名称（例如：天津）
# 用于显示在天气卡片中，避免调用 city/lookup 接口节省请求次数
OWNER_LOCATION_NAME=天津
```

### 4. 配置平台文件（可选）

如果不想使用环境变量，也可以在 `config/platforms.json` 中配置：

```json
{
  "weather": {
    "enabled": true,
    "provider": "qweather",
    "api": {
      "qweather": {
        "apiKey": "your_api_key_here",
        "city": "北京"
      }
    }
  }
}
```

**注意**：如果同时配置了环境变量和平台文件，环境变量优先级更高。

## API接口

### GET /api/status/weather

返回天气数据，包含站长天气和访客天气。

**响应格式：**

```json
{
  "success": true,
  "data": {
    "owner": {
      "temp": 24,
      "condition": "多云",
      "conditionZh": "多云",
      "humidity": "65%",
      "wind": "3级",
      "feelsLike": 26,
      "pressure": "1013",
      "vis": "16",
      "cloud": "75",
      "updateTime": "2024-01-01T12:00+08:00",
      "locationId": "101010100",
      "city": "北京"
    },
    "visitor": {
      "temp": 22,
      "condition": "晴",
      "conditionZh": "晴",
      "humidity": "60%",
      "wind": "2级",
      "feelsLike": 23,
      "locationId": "101020100",
      "city": "上海",
      "adm1": "上海",
      "adm2": "上海市",
      "country": "中国"
    },
    // 向后兼容字段（优先访客，否则站长）
    "temp": 22,
    "condition": "晴",
    "conditionZh": "晴",
    "humidity": "60%",
    "wind": "2级",
    "feelsLike": 23,
    "city": "上海",
    "locationId": "101020100"
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**字段说明：**

- `owner`: 站长天气数据（固定位置）
- `visitor`: 访客天气数据（根据IP自动定位，如果获取失败则为null）
- 其他字段：向后兼容，优先使用访客数据，如果没有则使用站长数据

## 缓存策略

### 站长天气缓存

- **TTL**: 30分钟
- **最大缓存数**: 1条
- **原因**: 天气变化较慢，30分钟更新一次足够

### 访客天气缓存

- **TTL**: 60分钟
- **最大缓存数**: 100个IP
- **原因**: 同一IP短时间内不需要重复查询

### IP定位缓存

- **TTL**: 24小时
- **最大缓存数**: 500个IP
- **原因**: IP对应的位置信息基本不变

## 错误处理

服务具有完善的错误处理机制：

- **API Key未配置**：返回null，不会导致服务崩溃
- **Location ID无效**：返回null，记录警告日志
- **IP定位失败**：访客天气返回null，不影响站长天气
- **网络错误**：返回null，使用缓存数据（如果有）

## 监控和调试

### 查看缓存统计

可以在代码中调用 `qweatherService.getCacheStats()` 查看缓存使用情况：

```javascript
const stats = qweatherService.getCacheStats();
console.log(stats);
// {
//   owner: { size: 1, max: 1 },
//   visitor: { size: 5, max: 100 },
//   ipLocation: { size: 10, max: 500 }
// }
```

### 清除缓存

如果需要清除所有缓存：

```javascript
qweatherService.clearCache();
```

### 日志输出

服务会输出详细的日志信息：

- `[和风天气] 站长天气缓存命中`
- `[和风天气] 获取站长天气: Location ID = 101010100`
- `[和风天气] 访客天气缓存命中: 192.168.1.1`
- `[和风天气] IP定位成功: 192.168.1.1 -> 北京 (101010100)`

## 注意事项

1. **API额度限制**：免费版每月50,000次请求，请合理使用缓存
2. **IP定位准确性**：IP定位可能不够准确，建议配置固定城市
3. **本地IP**：本地IP（127.0.0.1、192.168.x.x等）无法定位，会跳过
4. **缓存更新**：修改配置后需要重启服务才能生效

## 故障排查

### 问题：站长天气返回null

1. 检查 `QWEATHER_KEY` 是否配置正确
2. 检查 `OWNER_LOCATION_ID` 是否有效
3. 查看后端日志，确认API请求是否成功

### 问题：访客天气返回null

1. 检查API Key是否有效
2. 确认访客IP不是本地IP
3. 查看日志，确认IP定位是否成功

### 问题：API请求失败（403错误）

**错误信息示例：**
```
[和风天气] 天气请求失败: locationId=101030100 Request failed with status code 403
```

**可能原因和解决方案：**

1. **请求主机未授权（Invalid Host）** ⚠️ **最常见**
   
   错误信息示例：
   ```json
   {
     "error": {
       "status": 403,
       "type": "invalid-host",
       "title": "Invalid Host",
       "detail": "An invalid or unauthorized API Host."
     }
   }
   ```
   
   **解决方案：**
   - 登录 [和风天气控制台](https://dev.qweather.com/)
   - 进入"API配置"或"应用管理"
   - 找到"请求主机"或"Host白名单"设置
   - 添加你的服务器IP地址或域名到白名单
   - 本地开发环境可以添加：
     - `127.0.0.1`
     - `localhost`
     - 你的公网IP地址
   - 服务器部署环境添加：
     - 服务器公网IP
     - 服务器域名（如果有）

2. **API Key无效或已过期**
   - 检查 `QWEATHER_KEY` 环境变量是否正确配置
   - 登录 [和风天气控制台](https://dev.qweather.com/) 确认API Key状态
   - 如果API Key已过期，请重新生成并更新配置

2. **请求主机未授权**
   - 登录和风天气控制台，进入"API配置"
   - 检查"请求主机"设置，确保你的服务器IP或域名已被授权
   - 如果使用本地开发环境（127.0.0.1或localhost），可能需要添加授权

3. **超出请求限制**
   - 免费版限制：每天1,000次请求，每月50,000次请求
   - 检查控制台中的请求统计，确认是否超出限制
   - 如果超出限制，需要等待下一天/月重置，或升级订阅计划

4. **账户余额不足**
   - 登录和风天气控制台，检查账户余额
   - 如果余额不足，请进行充值

5. **Location ID无效**
   - 确认 `OWNER_LOCATION_ID` 是否正确
   - 使用城市搜索API验证Location ID：
     ```bash
     curl "https://geoapi.qweather.com/v2/city/lookup?location=城市名&key=YOUR_API_KEY"
     ```

**排查步骤：**

1. 检查环境变量配置：
   ```bash
   # Windows PowerShell
   echo $env:QWEATHER_KEY
   echo $env:OWNER_LOCATION_ID
   
   # Linux/Mac
   echo $QWEATHER_KEY
   echo $OWNER_LOCATION_ID
   ```

2. 测试API Key是否有效：
   ```bash
   curl "https://devapi.qweather.com/v7/weather/now?location=101010100&key=YOUR_API_KEY"
   ```

3. 查看详细错误日志：
   - 改进后的错误处理会输出详细的错误信息和建议
   - 根据日志中的提示进行相应处理

### 问题：其他API请求失败

1. 检查网络连接
2. 确认API Key未过期
3. 检查API额度是否用完
4. 查看后端日志获取详细错误信息

## 相关文档

- [和风天气API文档](https://dev.qweather.com/docs/api/)
- [城市Location ID查询](https://github.com/qwd/LocationList)
- [和风天气开发者平台](https://dev.qweather.com/)

