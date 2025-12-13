# 配置指南

本文档说明如何配置数据采集系统的各个组件，包括 API 密钥认证和自定义配置。

## 目录

- [后端服务配置](#后端服务配置)
- [PC 端采集器配置](#pc-端采集器配置)
- [API 密钥配置](#api-密钥配置)

## 后端服务配置

### 1. 创建配置文件

在 `backend` 目录下创建 `.env` 文件：

```bash
cd backend
cp .env.example .env
```

### 2. 配置项说明

| 配置项 | 说明 | 默认值 | 必需 |
|--------|------|--------|------|
| `PORT` | 服务端口 | `3000` | 否 |
| `API_KEY` | API 密钥 | **必需** | **是** |
| `REQUIRE_API_KEY` | 是否强制要求密钥 | `true` | 否（默认强制） |

### 3. 配置 API 密钥（必需）

**步骤 1: 手动填写密钥**

在 `backend/.env` 文件中，找到 `API_KEY=` 这一行，在等号后面填写您的密钥：

```env
API_KEY=your-custom-secret-key-here
```

**建议：** 使用至少32个字符的随机字符串作为密钥，例如：
- 字母数字组合：`MySecretKey2024DataCollectorSystem123`
- 随机字符串：`a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0`

**步骤 2: 配置后端（必需）**

在 `backend/.env` 中**必须**填写：

```env
API_KEY=your-custom-secret-key-here
```

**注意：** 如果不填写 `API_KEY`，后端将拒绝所有设备上报请求！

**步骤 3: 配置采集器（必需）**

在所有采集器的 `.env` 文件中**必须**填写**相同的密钥**：

**Windows 采集器 (`data-collectors/windows-collector/.env`):**
```env
API_KEY=your-custom-secret-key-here
```

**重要：** 
- 所有采集器的 `API_KEY` 必须与后端的 `API_KEY` **完全一致**（区分大小写）
- 密钥必须手动填写，不能为空
- 密钥不匹配将导致所有数据上传失败

## PC 端采集器配置

### 1. 创建配置文件

在 `collector` 目录下创建 `.env` 文件：

```bash
cd collector
cp .env.example .env
```

### 2. 配置项说明

| 配置项 | 说明 | 默认值 | 必需 |
|--------|------|--------|------|
| `API_BASE_URL` | 后端 API 地址 | `http://localhost:3000` | 否 |
| `API_KEY` | API 密钥 | `null` | 如果后端启用则必需 |
| `POLL_INTERVAL` | 轮询间隔（毫秒） | `2000` | 否 |
| `UPLOAD_INTERVAL` | 上传间隔（毫秒） | `60000` | 否 |
| `MIN_USAGE_TIME` | 最小使用时长（毫秒） | `5000` | 否 |
| `DEVICE_ID` | 设备ID | `PC-${hostname}` | 否 |
| `DEVICE_NAME` | 设备名称 | `${hostname}` | 否 |

### 3. 配置示例

```env
# API 配置
API_BASE_URL=http://192.168.1.100:3000
API_KEY=your-secret-api-key-here

# 采集配置
POLL_INTERVAL=2000
UPLOAD_INTERVAL=60000
MIN_USAGE_TIME=5000

# 设备信息（可选）
DEVICE_ID=PC-MyWorkstation
DEVICE_NAME=My Workstation
```

## API 密钥配置

### ⚠️ 重要：密钥验证已强制启用

**默认情况下，后端强制要求 API 密钥验证。所有设备上报请求必须提供正确的密钥才能上传数据。**

### 密钥验证流程

1. **后端验证（强制）**：
   - 默认情况下，所有 `/api/report/*` 接口都**必须**提供密钥
   - 密钥通过请求头传递：`X-API-Key: your-key` 或 `Authorization: Bearer your-key`
   - 密钥必须与后端配置的 `API_KEY` **完全一致**（区分大小写）

2. **采集器发送**：
   - **必须**在 `.env` 文件中配置 `API_KEY`
   - 如果未配置或密钥不匹配，所有数据上传请求将被拒绝
   - 错误信息会明确提示密钥相关问题

### 密钥格式

- 建议使用 32 字节（64 个十六进制字符）的随机字符串
- 示例：`a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6`

### 安全建议

1. **生产环境必须启用密钥验证**
   ```env
   REQUIRE_API_KEY=true
   ```

2. **使用强密钥**
   - 至少 32 字节
   - 随机生成
   - 不要使用可预测的值

3. **定期轮换密钥**
   - 建议每 3-6 个月更换一次
   - 更换时同时更新后端和所有采集器

4. **保护密钥文件**
   - `.env` 文件不要提交到版本控制
   - 使用文件权限限制访问（Linux/macOS: `chmod 600 .env`）

## 配置验证

### 检查后端配置

启动后端服务，查看控制台输出：

```
🚀 服务器运行在 http://localhost:3000
🔐 API 密钥验证: 已启用
   密钥长度: 64 字符
```

### 检查采集器配置

启动采集器，查看日志：

```
🚀 Windows 数据采集客户端启动
📡 API 地址: http://localhost:3000
🔑 API 密钥: 已配置
```

如果看到 `[上传失败] HTTP 401: Unauthorized` 或 `[上传失败] HTTP 403: Forbidden`，说明密钥配置不正确。

## 常见问题

### Q: 必须配置 API 密钥吗？

**A:** **是的，必须配置！** 默认情况下，后端强制要求 API 密钥验证。如果不配置：
- 后端会拒绝所有设备上报请求
- 采集器会收到 401/403 错误
- 数据将无法上传

### Q: 密钥配置错误会怎样？

**A:** 采集器会收到 401 或 403 错误，数据无法上传。错误信息会明确提示：
- `缺少 API 密钥` - 未在请求头中提供密钥
- `API 密钥无效` - 提供的密钥与后端配置不一致

### Q: 可以禁用密钥验证吗？

**A:** 仅用于开发环境，在 `backend/.env` 中设置：
```env
REQUIRE_API_KEY=false
```
**注意：** 生产环境强烈建议保持启用状态！

### Q: 不同设备可以使用不同的密钥吗？

**A:** 当前版本只支持单一密钥。如需多密钥支持，需要修改后端代码实现密钥白名单。

## 配置模板

### 开发环境（禁用密钥验证，不推荐）

**backend/.env:**
```env
PORT=3000
API_KEY=dev-key-123  # 即使禁用验证，也建议配置一个密钥
REQUIRE_API_KEY=false  # 仅开发环境使用
```

**data-collectors/windows-collector/.env:**
```env
API_BASE_URL=http://localhost:3000
API_KEY=dev-key-123  # 与后端保持一致
```

### 生产环境（启用密钥）

**backend/.env:**
```env
PORT=3000
API_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
REQUIRE_API_KEY=true
```

**data-collectors/windows-collector/.env:**
```env
API_BASE_URL=http://your-server-ip:3000
API_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```


