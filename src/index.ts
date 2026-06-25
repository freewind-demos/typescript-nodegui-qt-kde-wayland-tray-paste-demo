import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  QAction,
  QApplication,
  QClipboardMode,
  QIcon,
  QMenu,
  QMessageBox,
  QSystemTrayIcon,
} from "@nodegui/nodegui";

// 定义托盘里展示的五句话。
const phrases = [
  "你好，KDE 托盘粘贴测试。",
  "今天先把这个小问题干掉。",
  "Paste from tray, then keep coding.",
  "中英混合 test，一次点击直接落字。",
  "光标停哪儿，这句话就去那儿。"
] as const;

// 约束当前 demo 只服务 KDE X11 粘贴测试场景，避免引入 Wayland 复杂兼容层。
// @why 当前目标是验证“点击托盘菜单后往焦点位置粘贴文本”，X11 下 `xdotool + Ctrl+V` 最短且最稳。
const requiredSessionType = "x11";

// 取到 qode 预先创建好的 Qt 应用实例。
const app = QApplication.instance();

// 托盘应用不依赖主窗口存活。
app.setQuitOnLastWindowClosed(false);

// 拿到系统剪贴板对象。
const clipboard = QApplication.clipboard();

// 生成托盘图标路径。
const iconPath = join(__dirname, "../assets/tray-icon.svg");

// 创建托盘图标对象。
const trayIcon = new QIcon(iconPath);

// 创建托盘实例。
const tray = new QSystemTrayIcon();

// 创建右键菜单实例。
const menu = new QMenu();

// 保存 action 引用，防止被 GC。
const actions: QAction[] = [];

// 校验运行环境是否符合 X11 预期。
function validateRuntime(): void {
  // 读取当前桌面会话类型。
  const sessionType = (process.env.XDG_SESSION_TYPE ?? "").toLowerCase();

  // 若不是 X11，直接提示原因。
  if (sessionType !== requiredSessionType) {
    // 弹窗说明当前限制。
    showError(
      "当前不是 X11 会话",
      `检测到 XDG_SESSION_TYPE=${sessionType || "unknown"}。\n这个 demo 先只支持 KDE X11。`
    );
    // 结束进程，避免用户误判成功。
    process.exit(1);
  }

  // 用最直接方式检查 xdotool 是否已安装。
  try {
    // 只做存在性检查，不关心输出。
    execFileSync("xdotool", ["--version"], { stdio: "ignore" });
  } catch {
    // 缺工具时明确告诉用户怎么装。
    showError(
      "缺少 xdotool",
      "请先安装 xdotool，例如：sudo apt install xdotool"
    );
    // 结束进程，避免后续点击时报错。
    process.exit(1);
  }
}

// 统一错误弹窗。
function showError(title: string, text: string): void {
  // 使用原生消息框展示错误。
  const messageBox = new QMessageBox();
  messageBox.setText(title);
  messageBox.setInformativeText(text);
  messageBox.exec();
}

// 执行真正的“粘贴到当前焦点位置”动作。
function pastePhrase(phrase: string): void {
  try {
    // 先把目标句子写入标准剪贴板。
    clipboard?.setText(phrase, QClipboardMode.Clipboard);

    // 给目标应用一个很短时间接收焦点回切。
    execFileSync("xdotool", ["sleep", "0.1"], { stdio: "ignore" });

    // 发送 Ctrl+V，让焦点窗口执行原生粘贴。
    execFileSync("xdotool", ["key", "--clearmodifiers", "ctrl+v"], {
      stdio: "ignore"
    });

    // 成功后给个轻提示，便于观察是否触发。
    tray.showMessage("已粘贴", phrase, trayIcon, 1500);
  } catch (error) {
    // 失败时展示原始错误，便于排查环境问题。
    const message = error instanceof Error ? error.message : String(error);
    // 汇总成可读提示。
    showError("粘贴失败", message);
  }
}

// 逐条创建托盘菜单项。
for (const phrase of phrases) {
  // 为每句话创建一个 action。
  const action = new QAction();

  // 菜单文字直接显示原句。
  action.setText(phrase);

  // 点击时把当前句子粘贴到焦点位置。
  action.addEventListener("triggered", () => {
    // 执行对应粘贴动作。
    pastePhrase(phrase);
  });

  // 把 action 加进菜单。
  menu.addAction(action);

  // 留住引用，避免对象回收。
  actions.push(action);
}

// 增加一条分隔线，让退出项更清楚。
menu.addSeparator();

// 创建退出 action。
const quitAction = new QAction();

// 设置退出文案。
quitAction.setText("退出");

// 点击后退出应用。
quitAction.addEventListener("triggered", () => {
  // 直接结束事件循环。
    app.quit();
});

// 加入菜单。
menu.addAction(quitAction);

// 也保留退出项引用。
actions.push(quitAction);

// 启动前做环境检查。
validateRuntime();

// 设置托盘图标。
tray.setIcon(trayIcon);

// 设置悬浮提示。
tray.setToolTip("KDE 托盘粘贴测试");

// 绑定菜单。
tray.setContextMenu(menu);

// 展示托盘。
tray.show();

// 保留关键对象到全局，防止 Qt 对象被回收。
(globalThis as typeof globalThis & {
  tray?: QSystemTrayIcon;
  menu?: QMenu;
  actions?: QAction[];
}).tray = tray;

// 保留菜单引用。
(globalThis as typeof globalThis & {
  tray?: QSystemTrayIcon;
  menu?: QMenu;
  actions?: QAction[];
}).menu = menu;

// 保留 action 列表引用。
(globalThis as typeof globalThis & {
  tray?: QSystemTrayIcon;
  menu?: QMenu;
  actions?: QAction[];
}).actions = actions;

// 进入 Qt 事件循环。
app.exec();
