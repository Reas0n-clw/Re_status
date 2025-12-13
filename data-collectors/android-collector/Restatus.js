/**
 * ReStatus 手机端采集器 (多线程稳定版 V3,再也不改版)
 */

// ================= 配置区域 =================
const CONFIG = {
    // ⚠️ 请务必修改为你的 IP地址(域名):端口 格式 (例如 http://192.168.1.X:3000/api/report/device)
    API_URL: "http://192.168.1.X:3000/api/report/device", 
    
    // 你的 API 密钥
    API_KEY: "your_secret_key_here", 
    
    DEVICE_ID: "mobile_01",
    DEVICE_NAME: device.model,
    INTERVAL: 5000
};
// ===========================================

log("🚀 监控启动 (多线程版)");
log("目标: " + CONFIG.API_URL);

// 引入安卓类
importClass(android.content.BroadcastReceiver);
importClass(android.content.Intent);
importClass(android.content.IntentFilter);
importClass(android.net.ConnectivityManager);

// 初始化变量
let lastPackage = "";
let isReceiverRegistered = false;

// === 核心上报函数 (同步执行，需在线程中调用) ===
function doUpload(statusOverride) {
    try {
        // 1. 获取基础数据
        var battery = device.getBattery();
        var isCharging = device.isCharging();
        
        // 获取网络状态
        var netType = "Unknown";
        try {
            var cm = context.getSystemService(context.CONNECTIVITY_SERVICE);
            var netInfo = cm.getActiveNetworkInfo();
            if (netInfo && netInfo.isConnected()) {
                netType = (netInfo.getType() == ConnectivityManager.TYPE_WIFI) ? "Wifi" : "Cellular";
            } else {
                netType = "Offline";
            }
        } catch(e) {}

        // 获取当前应用
        var currentPkg = currentPackage();
        var currentName = getAppName(currentPkg) || "System";
        
        if (statusOverride === "sleep") {
            currentName = "Screen Off";
        }

        // 2. 构建数据
        var payload = {
            type: "status",
            deviceId: CONFIG.DEVICE_ID,
            deviceName: CONFIG.DEVICE_NAME,
            deviceType: "mobile",
            deviceOS: "Android " + device.release,
            status: statusOverride || "online",
            battery: battery,
            isCharging: isCharging,
            networkType: netType,
            currentApp: {
                name: currentName,
                packageName: currentPkg,
                icon: "📱"
            },
            duration: CONFIG.INTERVAL / 1000
        };

        // 3. 发送请求
        var res = http.postJson(CONFIG.API_URL, payload, {
            headers: { "x-api-key": CONFIG.API_KEY }
        });
        
        // 4. 打印结果 (只显示重要状态)
        if (res.statusCode == 200) {
            if (statusOverride) {
                log("✅ 状态更新成功: " + statusOverride);
            }
            // 平时心跳成功不刷屏
        } else {
            log("❌ 服务器拒绝: " + res.statusCode + " " + res.body.string());
        }

    } catch (e) {
        log("❌ 上传出错: " + e.message);
    }
}

// === 线程包装器 (关键修改) ===
// 所有的上报动作都通过这个函数去启动一个新线程
function reportStatusAsync(statusOverride) {
    threads.start(function() {
        doUpload(statusOverride);
    });
}

// === 广播监听器 ===
var screenReceiver = new BroadcastReceiver({
    onReceive: function(context, intent) {
        var action = intent.getAction();
        if (Intent.ACTION_SCREEN_OFF.equals(action)) {
            log("🌙 检测到息屏 -> 正在上报...");
            // 在广播中必须使用子线程网络请求，否则会报错
            reportStatusAsync("sleep");
        } else if (Intent.ACTION_SCREEN_ON.equals(action)) {
            log("☀️ 检测到亮屏 -> 正在上报...");
            reportStatusAsync("online");
        }
    }
});

// 注册广播
try {
    var filter = new IntentFilter();
    filter.addAction(Intent.ACTION_SCREEN_ON);
    filter.addAction(Intent.ACTION_SCREEN_OFF);
    context.registerReceiver(screenReceiver, filter);
    isReceiverRegistered = true;
    log("📡 屏幕监听已就绪");
} catch (e) {
    error("注册广播失败: " + e.message);
}

// 注销广播
events.on("exit", function() {
    if (isReceiverRegistered) {
        context.unregisterReceiver(screenReceiver);
        log("广播已注销");
    }
});

// === 定时心跳 (保持在线) ===
setInterval(() => {
    // 只有亮屏时才发送心跳，避免覆盖 sleep 状态
    if (device.isScreenOn()) {
        reportStatusAsync("online");
    }
}, CONFIG.INTERVAL);

// 立即尝试一次上报，检测配置是否正确
reportStatusAsync("online");

// 保持运行
setInterval(() => {}, 10000);