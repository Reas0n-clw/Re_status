# 平台配置说明（前端默认）

`src/config/platforms.js` 提供前端默认值和类型参考。实际配置由后端 `config/platforms.json` 决定，前端仅作占位和兜底。

## 平台开关

每个平台包含 `enabled`，控制是否在切换器中展示。例如：
```javascript
steam: {
  enabled: true,
  api: { apiKey: '', steamId64: '' }
}
```

## 已预留的平台

- `steam`、`bilibili`、`weather`：当前可用
- `github`、`discord`、`spotify`：扩展占位，当前不生效

## 获取启用的平台

```javascript
import { getEnabledPlatforms } from './platforms';

const enabled = getEnabledPlatforms(); // e.g. ['steam', 'bilibili', 'weather']
```

## 提示

- 优先使用后端 API (`GET /api/config/platforms`) 返回的配置
- 敏感信息不会返回给前端，需在后端配置或使用环境变量

