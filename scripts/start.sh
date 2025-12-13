#!/bin/bash
# Re_status 启动脚本 - Linux 服务器版本
# 使用方法：
#   1. 直接运行：./start.sh
#   2. 后台运行：./start.sh start
#   3. 停止服务：./start.sh stop
#   4. 查看状态：./start.sh status
#   5. 安装 systemd 服务：./start.sh install
#   6. 卸载 systemd 服务：./start.sh uninstall

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_NAME="re-status"
PID_FILE="$PROJECT_ROOT/.$PROJECT_NAME.pid"
LOG_FILE="$PROJECT_ROOT/logs/$PROJECT_NAME.log"
START_CMD="npm run deploy:native"

# 创建日志目录
mkdir -p "$PROJECT_ROOT/logs"

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "[错误] 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

# 检查 npm 是否安装
if ! command -v npm &> /dev/null; then
    echo "[错误] 未找到 npm，请先安装 Node.js"
    exit 1
fi

# 启动服务
start_service() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "[警告] 服务已在运行 (PID: $PID)"
            return 1
        else
            rm -f "$PID_FILE"
        fi
    fi
    
    echo "[信息] 启动 $PROJECT_NAME..."
    echo "[信息] 工作目录: $PROJECT_ROOT"
    echo "[信息] 日志文件: $LOG_FILE"
    
    cd "$PROJECT_ROOT"
    nohup $START_CMD > "$LOG_FILE" 2>&1 &
    PID=$!
    echo $PID > "$PID_FILE"
    
    sleep 2
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "[成功] 服务已启动 (PID: $PID)"
        echo "[提示] 查看日志: tail -f $LOG_FILE"
    else
        echo "[错误] 服务启动失败，请查看日志: $LOG_FILE"
        rm -f "$PID_FILE"
        return 1
    fi
}

# 停止服务
stop_service() {
    if [ ! -f "$PID_FILE" ]; then
        echo "[警告] 未找到 PID 文件，服务可能未运行"
        return 1
    fi
    
    PID=$(cat "$PID_FILE")
    if ! ps -p "$PID" > /dev/null 2>&1; then
        echo "[警告] 进程不存在 (PID: $PID)"
        rm -f "$PID_FILE"
        return 1
    fi
    
    echo "[信息] 停止服务 (PID: $PID)..."
    kill "$PID" 2>/dev/null || true
    
    # 等待进程结束
    for i in {1..10}; do
        if ! ps -p "$PID" > /dev/null 2>&1; then
            break
        fi
        sleep 1
    done
    
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "[警告] 进程未正常退出，强制终止..."
        kill -9 "$PID" 2>/dev/null || true
    fi
    
    rm -f "$PID_FILE"
    echo "[成功] 服务已停止"
}

# 查看状态
status_service() {
    if [ ! -f "$PID_FILE" ]; then
        echo "[信息] 服务未运行"
        return 1
    fi
    
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "[信息] 服务正在运行 (PID: $PID)"
        echo "[信息] 进程信息:"
        ps -p "$PID" -o pid,ppid,cmd,etime
        return 0
    else
        echo "[信息] 服务未运行 (PID 文件存在但进程不存在)"
        rm -f "$PID_FILE"
        return 1
    fi
}

# 安装 systemd 服务
install_service() {
    if [ "$EUID" -ne 0 ]; then
        echo "[错误] 需要 root 权限，请使用 sudo 运行"
        exit 1
    fi
    
    SERVICE_FILE="/etc/systemd/system/${PROJECT_NAME}.service"
    
    echo "[信息] 安装 systemd 服务..."
    
    # 获取实际运行用户
    ACTUAL_USER=${SUDO_USER:-$USER}
    if [ "$ACTUAL_USER" = "root" ]; then
        ACTUAL_USER=$(whoami)
    fi
    
    # 获取 Node.js 和 npm 的完整路径
    NODE_PATH=$(which node)
    NPM_PATH=$(which npm)
    
    # 创建服务文件
    cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Re_status Service
After=network.target

[Service]
Type=simple
User=$ACTUAL_USER
WorkingDirectory=$PROJECT_ROOT
ExecStart=$NPM_PATH run deploy:native
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
    
    # 重新加载 systemd
    systemctl daemon-reload
    
    # 启用服务
    systemctl enable "$PROJECT_NAME.service"
    
    echo "[成功] systemd 服务已安装"
    echo "[信息] 服务文件: $SERVICE_FILE"
    echo "[提示] 启动服务: sudo systemctl start $PROJECT_NAME"
    echo "[提示] 查看状态: sudo systemctl status $PROJECT_NAME"
    echo "[提示] 查看日志: sudo journalctl -u $PROJECT_NAME -f"
}

# 卸载 systemd 服务
uninstall_service() {
    if [ "$EUID" -ne 0 ]; then
        echo "[错误] 需要 root 权限，请使用 sudo 运行"
        exit 1
    fi
    
    SERVICE_FILE="/etc/systemd/system/${PROJECT_NAME}.service"
    
    echo "[信息] 卸载 systemd 服务..."
    
    if [ -f "$SERVICE_FILE" ]; then
        systemctl stop "$PROJECT_NAME.service" 2>/dev/null || true
        systemctl disable "$PROJECT_NAME.service" 2>/dev/null || true
        rm -f "$SERVICE_FILE"
        systemctl daemon-reload
        echo "[成功] systemd 服务已卸载"
    else
        echo "[警告] 未找到服务文件"
    fi
}

# 主逻辑
case "${1:-}" in
    start)
        start_service
        ;;
    stop)
        stop_service
        ;;
    status)
        status_service
        ;;
    restart)
        stop_service
        sleep 2
        start_service
        ;;
    install)
        install_service
        ;;
    uninstall)
        uninstall_service
        ;;
    *)
        # 直接运行模式
        echo "[信息] 启动 $PROJECT_NAME..."
        echo "[信息] 工作目录: $PROJECT_ROOT"
        echo ""
        cd "$PROJECT_ROOT"
        $START_CMD
        ;;
esac

