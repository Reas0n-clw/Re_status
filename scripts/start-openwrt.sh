#!/bin/sh
# Re_status 启动脚本 - OpenWrt 版本
# 使用方法：
#   1. 直接运行（前台调试）：./start-openwrt.sh
#   2. 启动服务（后台）：./start-openwrt.sh start
#   3. 停止服务：./start-openwrt.sh stop
#   4. 查看状态：./start-openwrt.sh status
#   5. 重启服务：./start-openwrt.sh restart
#   6. 调试模式（前台运行，显示所有输出）：./start-openwrt.sh debug
#   7. 安装 init.d 服务：./start-openwrt.sh install
#   8. 卸载 init.d 服务：./start-openwrt.sh uninstall

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_NAME="re-status"
PID_FILE="/var/run/$PROJECT_NAME.pid"
LOG_FILE="/var/log/$PROJECT_NAME.log"
START_CMD="npm run deploy:native"

# 确保日志目录存在
if [ ! -d "/var/log" ]; then
    mkdir -p "/var/log" 2>/dev/null || {
        # 如果无法创建 /var/log，使用项目目录下的 logs 目录
        LOG_FILE="$PROJECT_ROOT/logs/$PROJECT_NAME.log"
        mkdir -p "$PROJECT_ROOT/logs" 2>/dev/null || true
    }
fi

# 检查 Node.js 是否安装
if ! command -v node >/dev/null 2>&1; then
    echo "[错误] 未找到 Node.js，请先安装 Node.js"
    echo "[提示] OpenWrt 安装 Node.js: opkg install node npm"
    exit 1
fi

# 检查 npm 是否安装
if ! command -v npm >/dev/null 2>&1; then
    echo "[错误] 未找到 npm，请先安装 npm"
    echo "[提示] OpenWrt 安装 npm: opkg install npm"
    exit 1
fi

# 获取 npm 和 node 的完整路径
NPM_PATH=$(which npm)
NODE_PATH=$(which node)

if [ -z "$NPM_PATH" ] || [ -z "$NODE_PATH" ]; then
    echo "[错误] 无法找到 npm 或 node 的路径"
    exit 1
fi

echo "[信息] Node.js 路径: $NODE_PATH"
echo "[信息] npm 路径: $NPM_PATH"

# 检查端口是否被占用
check_port() {
    PORT=${1:-3000}
    
    # 尝试使用 netstat 查找占用端口的进程
    if command -v netstat >/dev/null 2>&1; then
        PID=$(netstat -tlnp 2>/dev/null | grep ":$PORT " | awk '{print $7}' | cut -d'/' -f1 | head -n1)
        if [ -n "$PID" ] && [ "$PID" != "-" ]; then
            echo "$PID"
            return 0
        fi
    fi
    
    # 尝试使用 ss 查找占用端口的进程
    if command -v ss >/dev/null 2>&1; then
        PID=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -o 'pid=[0-9]*' | cut -d'=' -f2 | head -n1)
        if [ -n "$PID" ]; then
            echo "$PID"
            return 0
        fi
    fi
    
    # 尝试使用 fuser（如果可用）
    if command -v fuser >/dev/null 2>&1; then
        PID=$(fuser "$PORT/tcp" 2>/dev/null | awk '{print $1}')
        if [ -n "$PID" ]; then
            echo "$PID"
            return 0
        fi
    fi
    
    # 如果都不可用，尝试通过进程名查找 node 进程
    PID=$(ps | grep -E "node.*server\.js|node.*deploy:native" | grep -v grep | awk '{print $1}' | head -n1)
    if [ -n "$PID" ]; then
        echo "$PID"
        return 0
    fi
    
    return 1
}

# 清理占用端口的进程
cleanup_port() {
    PORT=${1:-3000}
    echo "[信息] 检查端口 $PORT 是否被占用..."
    
    PID=$(check_port "$PORT")
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        echo "[警告] 端口 $PORT 被进程占用 (PID: $PID)"
        echo "[信息] 正在停止占用端口的进程..."
        
        # 先尝试优雅停止
        kill "$PID" 2>/dev/null || true
        sleep 2
        
        # 检查进程是否还在运行
        if kill -0 "$PID" 2>/dev/null; then
            echo "[警告] 进程未响应，强制终止..."
            kill -9 "$PID" 2>/dev/null || true
            sleep 1
        fi
        
        # 再次检查
        if kill -0 "$PID" 2>/dev/null; then
            echo "[错误] 无法停止进程 (PID: $PID)"
            return 1
        else
            echo "[成功] 已停止占用端口的进程 (PID: $PID)"
            return 0
        fi
    else
        echo "[信息] 端口 $PORT 未被占用"
        return 0
    fi
}

# 启动服务
start_service() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "[警告] 服务已在运行 (PID: $PID)"
            return 1
        else
            rm -f "$PID_FILE"
        fi
    fi
    
    echo "[信息] 启动 $PROJECT_NAME..."
    echo "[信息] 工作目录: $PROJECT_ROOT"
    echo "[信息] 日志文件: $LOG_FILE"
    
    # 检查项目目录是否存在
    if [ ! -d "$PROJECT_ROOT" ]; then
        echo "[错误] 项目目录不存在: $PROJECT_ROOT"
        return 1
    fi

    # 检查 package.json 是否存在
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        echo "[错误] 未找到 package.json，请确保在正确的项目目录中"
        return 1
    fi
    
    # 检查 node_modules 是否存在
    if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
        echo "[警告] 未找到 node_modules，正在安装依赖..."
        cd "$PROJECT_ROOT"
        "$NPM_PATH" install 2>&1 | tee -a "$LOG_FILE"
        if [ $? -ne 0 ]; then
            echo "[错误] 依赖安装失败，请查看日志: $LOG_FILE"
            return 1
        fi
    fi
    
    # 检查并清理端口占用
    if ! cleanup_port 3000; then
        echo "[错误] 无法清理端口占用，请手动停止占用端口的进程"
        echo "[提示] 查找占用端口的进程:"
        echo "  netstat -tlnp | grep :3000"
        echo "  或"
        echo "  ss -tlnp | grep :3000"
        return 1
    fi
    
    # 清空旧日志（保留最后100行）
    if [ -f "$LOG_FILE" ]; then
        tail -n 100 "$LOG_FILE" > "${LOG_FILE}.tmp" 2>/dev/null || true
        mv "${LOG_FILE}.tmp" "$LOG_FILE" 2>/dev/null || true
    fi
    
    # 记录启动信息到日志
    {
        echo "=========================================="
        echo "启动时间: $(date)"
        echo "工作目录: $PROJECT_ROOT"
        echo "Node.js 路径: $NODE_PATH"
        echo "npm 路径: $NPM_PATH"
        echo "Node.js 版本: $($NODE_PATH --version 2>&1)"
        echo "npm 版本: $($NPM_PATH --version 2>&1)"
        echo "=========================================="
    } >> "$LOG_FILE"
    
    cd "$PROJECT_ROOT"
    
    # 启动服务并记录所有输出
    echo "[信息] 正在启动服务，请稍候..."
    start-stop-daemon -S -b -m -p "$PID_FILE" -x "$NPM_PATH" -- run deploy:native >> "$LOG_FILE" 2>&1
    
    # 等待更长时间，因为构建可能需要时间
    sleep 5
    
    # 检查进程是否存在
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "[成功] 服务已启动 (PID: $PID)"
            echo "[提示] 查看日志: tail -f $LOG_FILE"
            echo "[提示] 检查服务: ./start-openwrt.sh status"
            return 0
        else
            echo "[错误] PID 文件存在但进程不存在"
        fi
    else
        echo "[错误] 未生成 PID 文件"
    fi
    
    # 如果启动失败，显示日志的最后几行
    echo "[错误] 服务启动失败"
    echo "[错误] 日志文件最后 20 行:"
    echo "----------------------------------------"
    tail -n 20 "$LOG_FILE" 2>/dev/null || echo "无法读取日志文件"
    echo "----------------------------------------"
    echo "[提示] 完整日志: cat $LOG_FILE"
    rm -f "$PID_FILE"
    return 1
}

# 停止服务
stop_service() {
    STOPPED=0
    
    # 首先尝试通过 PID 文件停止
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "[信息] 停止服务 (PID: $PID)..."
            start-stop-daemon -K -p "$PID_FILE" -s TERM 2>/dev/null || kill "$PID" 2>/dev/null || true
    
    # 等待进程结束
    for i in 1 2 3 4 5 6 7 8 9 10; do
        if ! kill -0 "$PID" 2>/dev/null; then
                    STOPPED=1
            break
        fi
        sleep 1
    done
    
    if kill -0 "$PID" 2>/dev/null; then
        echo "[警告] 进程未正常退出，强制终止..."
                start-stop-daemon -K -p "$PID_FILE" -s KILL 2>/dev/null || kill -9 "$PID" 2>/dev/null || true
                sleep 1
                if ! kill -0 "$PID" 2>/dev/null; then
                    STOPPED=1
                fi
            else
                STOPPED=1
            fi
        fi
        rm -f "$PID_FILE"
    fi
    
    # 清理可能占用端口的其他进程
    PORT_PID=$(check_port 3000)
    if [ -n "$PORT_PID" ] && kill -0 "$PORT_PID" 2>/dev/null; then
        echo "[信息] 发现占用端口 3000 的进程 (PID: $PORT_PID)，正在停止..."
        kill "$PORT_PID" 2>/dev/null || true
        sleep 2
        if kill -0 "$PORT_PID" 2>/dev/null; then
            kill -9 "$PORT_PID" 2>/dev/null || true
            sleep 1
        fi
        STOPPED=1
    fi
    
    # 清理所有相关的 node 进程（通过进程名）
    NODE_PIDS=$(ps | grep -E "node.*server\.js|node.*deploy:native" | grep -v grep | awk '{print $1}')
    if [ -n "$NODE_PIDS" ]; then
        echo "[信息] 发现相关 node 进程，正在停止..."
        for NODE_PID in $NODE_PIDS; do
            if kill -0 "$NODE_PID" 2>/dev/null; then
                echo "[信息] 停止进程 (PID: $NODE_PID)..."
                kill "$NODE_PID" 2>/dev/null || true
                sleep 1
                if kill -0 "$NODE_PID" 2>/dev/null; then
                    kill -9 "$NODE_PID" 2>/dev/null || true
                fi
                STOPPED=1
            fi
        done
    fi
    
    if [ $STOPPED -eq 1 ]; then
    echo "[成功] 服务已停止"
        return 0
    else
        echo "[警告] 未找到运行中的服务"
        return 1
    fi
}

# 查看状态
status_service() {
    if [ ! -f "$PID_FILE" ]; then
        echo "[信息] 服务未运行"
        echo "[提示] 启动服务: ./start-openwrt.sh start"
        return 1
    fi
    
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "[信息] 服务正在运行 (PID: $PID)"
        echo "[信息] 进程信息:"
        ps -p "$PID" -o pid,ppid,cmd,etime 2>/dev/null || ps | grep "$PID" | grep -v grep || true
        echo "[信息] 端口监听:"
        netstat -tlnp 2>/dev/null | grep ":3000" || ss -tlnp 2>/dev/null | grep ":3000" || echo "  无法检查端口（可能需要安装 netstat 或 ss）"
        return 0
    else
        echo "[信息] 服务未运行 (PID 文件存在但进程不存在)"
        rm -f "$PID_FILE"
        return 1
    fi
}

# 安装 init.d 服务
install_service() {
    INIT_SCRIPT="/etc/init.d/$PROJECT_NAME"
    
    echo "[信息] 安装 init.d 服务..."
    
    # 创建 init.d 脚本
    cat > "$INIT_SCRIPT" <<EOF
#!/bin/sh /etc/rc.common
# Re_status Service

START=99
STOP=10

start_service() {
    NPM_PATH=\$(which npm)
    if [ -z "\$NPM_PATH" ]; then
        echo "[错误] 无法找到 npm" >> "$LOG_FILE" 2>&1
        exit 1
    fi
    cd "$PROJECT_ROOT"
    start-stop-daemon -S -b -m -p "$PID_FILE" -x "\$NPM_PATH" -- run deploy:native >> "$LOG_FILE" 2>&1
}

stop_service() {
    if [ -f "$PID_FILE" ]; then
        PID=\$(cat "$PID_FILE")
        start-stop-daemon -K -p "$PID_FILE" -s TERM
        [ -f "$PID_FILE" ] && start-stop-daemon -K -p "$PID_FILE" -s KILL
        rm -f "$PID_FILE"
    fi
}

restart() {
    stop_service
    sleep 2
    start_service
}
EOF
    
    chmod +x "$INIT_SCRIPT"
    
    # 启用服务
    /etc/init.d/$PROJECT_NAME enable
    
    echo "[成功] init.d 服务已安装"
    echo "[信息] 服务文件: $INIT_SCRIPT"
    echo "[提示] 启动服务: /etc/init.d/$PROJECT_NAME start"
    echo "[提示] 停止服务: /etc/init.d/$PROJECT_NAME stop"
    echo "[提示] 查看状态: /etc/init.d/$PROJECT_NAME status"
}

# 卸载 init.d 服务
uninstall_service() {
    INIT_SCRIPT="/etc/init.d/$PROJECT_NAME"
    
    echo "[信息] 卸载 init.d 服务..."
    
    if [ -f "$INIT_SCRIPT" ]; then
        /etc/init.d/$PROJECT_NAME stop 2>/dev/null || true
        /etc/init.d/$PROJECT_NAME disable 2>/dev/null || true
        rm -f "$INIT_SCRIPT"
        echo "[成功] init.d 服务已卸载"
    else
        echo "[警告] 未找到服务文件"
    fi
}

# 调试模式（前台运行，显示所有输出）
debug_service() {
    echo "[信息] 调试模式启动 $PROJECT_NAME..."
    echo "[信息] 工作目录: $PROJECT_ROOT"
    echo "[信息] Node.js 路径: $NODE_PATH"
    echo "[信息] npm 路径: $NPM_PATH"
    echo ""
    
    # 检查项目目录
    if [ ! -d "$PROJECT_ROOT" ]; then
        echo "[错误] 项目目录不存在: $PROJECT_ROOT"
        return 1
    fi
    
    # 检查 package.json
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        echo "[错误] 未找到 package.json"
        return 1
    fi
    
    # 检查 node_modules
    if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
        echo "[警告] 未找到 node_modules，正在安装依赖..."
        cd "$PROJECT_ROOT"
        "$NPM_PATH" install
        if [ $? -ne 0 ]; then
            echo "[错误] 依赖安装失败"
            return 1
        fi
    fi
    
    # 检查并清理端口占用
    if ! cleanup_port 3000; then
        echo "[错误] 无法清理端口占用，请手动停止占用端口的进程"
        echo "[提示] 查找占用端口的进程:"
        echo "  netstat -tlnp | grep :3000"
        echo "  或"
        echo "  ss -tlnp | grep :3000"
        echo ""
        echo "[提示] 手动停止服务: ./start-openwrt.sh stop"
        return 1
    fi
    
    cd "$PROJECT_ROOT"
    echo "[信息] 执行命令: $START_CMD"
    echo "[提示] 按 Ctrl+C 停止服务"
    echo ""
    $START_CMD
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
    debug)
        debug_service
        ;;
    *)
        # 直接运行模式（前台运行）
        debug_service
        ;;
esac

