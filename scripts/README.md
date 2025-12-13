# 启动脚本使用说明

多平台启动脚本，便捷启动/后台运行/开机自启。根目录需先安装依赖并配置好 `backend/.env`。

## 文件

- `start.bat` / `start.ps1`：Windows
- `start.sh`：Linux 服务器
- `start-openwrt.sh`：OpenWrt
- `re-status.service`：systemd 模板

## Windows

- 直接运行：`start.bat` 或 `.\start.ps1`
- 隐藏运行：`start.bat silent` 或 `.\start.ps1 -Silent`
- 安装开机自启（管理员）：`start.bat install` 或 `.\start.ps1 -Install`
- 卸载开机自启（管理员）：`start.bat uninstall` 或 `.\start.ps1 -Uninstall`

自启通过任务计划程序，任务名 `Re_status`，SYSTEM 账户运行。

## Linux

```bash
cd scripts
chmod +x start.sh
./start.sh start      # 后台运行
./start.sh stop       # 停止
./start.sh status     # 查看状态
```

### systemd
```bash
sudo ./start.sh install
# 或手动将 re-status.service 放到 /etc/systemd/system
```
安装后可使用 `systemctl start/stop/restart/status re-status`。

## OpenWrt

```bash
cd scripts
chmod +x start-openwrt.sh
./start-openwrt.sh start     # 后台运行
./start-openwrt.sh debug     # 前台调试
./start-openwrt.sh install   # 安装 init.d
```

脚本会自动检测 node/npm 路径、检查端口占用、安装依赖并创建日志。

## 注意事项

- 请先在根目录执行 `npm install`
- 确认 `backend/.env` 中的 `API_KEY` 等已配置
- 默认端口 3000，如冲突可在 `.env` 调整 `PORT`
- 生产环境建议配合反向代理与 HTTPS

