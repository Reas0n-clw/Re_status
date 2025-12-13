# 配置文件说明

站点配置集中在 `config/` 目录，前端默认值仅用于类型定义，实际以后端读取的文件为准。请勿提交包含真实密钥的配置。

## 文件列表

- `config/platforms.json`：平台卡片配置（启用开关与 API 参数）
- `config/site.json`：个人资料与外观配置
- `backend/.env`：后端运行参数与密钥

## platforms.json

示例（核心字段）：
```json
{
  "steam": { "enabled": true, "api": { "steamId64": "", "apiKey": "" } },
  "bilibili": { "enabled": true, "api": { "uid": "", "sessdata": "" } },
  "weather": { "enabled": true, "api": { "qweather": { "apiKey": "", "city": "", "ownerLocationId": "" } } }
}
```

说明：
- `enabled` 控制平台开关
- GitHub/Discord/Spotify 等为扩展占位，当前不会生效

## site.json

示例：
```json
{
  "profile": {
    "name": "你的昵称",
    "avatar": "avatars/my-avatar.jpg",
    "location": "北京, 中国",
    "bgImage": "bg-images/my-bg.jpg"
  }
}
```

路径说明：
- 本地文件相对于 `backend/uploads`
- 头像建议放 `avatars/`，背景放 `bg-images/`
- 支持 JPEG/PNG/GIF/WebP

## 更新方式

- 可直接编辑文件，或通过 API：
  - `PUT /api/profile` 更新 `site.json`
  - `POST /api/profile/upload` 上传头像/背景并返回可用路径
- 环境变量优先级高于配置文件：如 `STEAM_API_KEY`、`QWEATHER_KEY`、`PROFILE_NAME` 等
- 通过文件修改后需重启后端；通过 API 更新即时生效

## 安全提示

- `.env`、`platforms.json`、`site.json` 请勿带真实密钥提交
- 生产环境可在 `.gitignore` 中保留本地副本，仓库仅存示例

