# 数据采集器

可选的设备数据上报组件，包含 Windows 程序与 Android Auto.js/AutoX.js 脚本。两者均需与后端 `API_KEY` 一致。

## 目录

```
data-collectors/
├── windows-collector/   # Windows 采集程序
└── android-collector/   # Android 脚本
```
## 关键配置

- `API_KEY`：必填，需与后端一致，区分大小写
- `API_BASE_URL`/`API_URL`：指向后端地址（不要写 localhost 给移动端）

## 参考文档

- `windows-collector/README.md`
- `android-collector/README.md`
- `../../CONFIG_GUIDE.md`

