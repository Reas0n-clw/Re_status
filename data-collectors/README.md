# 数据采集器

可选的设备数据上报组件，包含 Windows 程序与 Android Auto.js/AutoX.js 脚本。两者均需与后端 `API_KEY` 一致。

## 目录

```
data-collectors/
├── windows-collector/   # Windows 采集程序
└── android-collector/   # Android 脚本
```

## 快速开始

### Windows
```bash
cd data-collectors/windows-collector
npm install
cp env.example .env   # 填写 API_BASE_URL / API_KEY
```
- 支持终端运行、隐藏后台运行、开机自启（见子目录 README）

### Android
- 将 `android-collector/Restatus.js` 拷贝到手机，Auto.js/AutoX.js 打开
- 修改脚本中的 `API_URL` 与 `API_KEY`
- 开启无障碍与电池优化白名单后运行

## 关键配置

- `API_KEY`：必填，需与后端一致，区分大小写
- `API_BASE_URL`/`API_URL`：指向后端地址（不要写 localhost 给移动端）

## 参考文档

- `windows-collector/README.md`
- `android-collector/README.md`
- `../../CONFIG_GUIDE.md`

