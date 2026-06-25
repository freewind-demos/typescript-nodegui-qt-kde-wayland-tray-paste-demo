import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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

type SessionType = "x11" | "wayland";

// 当前 demo 同时服务 KDE X11 / Wayland 粘贴测试场景。
// @why 目标是验证“点击托盘菜单后往焦点位置粘贴文本”，不同会话用不同的输入模拟工具。
const supportedSessionTypes: SessionType[] = ["x11", "wayland"];

// 取到 qode 预先创建好的 Qt 应用实例。
const app = QApplication.instance();

// 托盘应用不依赖主窗口存活。
app.setQuitOnLastWindowClosed(false);

// 拿到系统剪贴板对象。
const clipboard = QApplication.clipboard();

// 生成托盘图标路径。
const currentDir = fileURLToPath(new URL(".", import.meta.url));
const iconPath = join(currentDir, "../assets/tray-icon.svg");
const projectRoot = dirname(currentDir);
const logDir = join(projectRoot, "log");
const logFilePath = join(logDir, "paste.log");
const userRuntimeDir = process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 0}`;
const ydotoolSocketPath = process.env.YDOTOOL_SOCKET ?? join(userRuntimeDir, "ydotoold.sock");
const ydotooldPidFilePath = join(userRuntimeDir, "ydotoold.pid");
const pasteDelayMs = 300;

// 创建托盘图标对象。
const trayIcon = new QIcon(iconPath);

// 创建托盘实例。
const tray = new QSystemTrayIcon();

// 创建右键菜单实例。
const menu = new QMenu();

// 保存 action 引用，防止被 GC。
const actions: QAction[] = [];

// 校验运行环境是否符合预期。
function validateRuntime(): void {
  // 读取当前桌面会话类型。
  const sessionType = (process.env.XDG_SESSION_TYPE ?? "").toLowerCase();

  // 若会话类型不在支持列表里，直接提示原因。
  if (!isSupportedSessionType(sessionType)) {
    // 弹窗说明当前限制。
    showError(
      "当前会话不受支持",
      `检测到 XDG_SESSION_TYPE=${sessionType || "unknown"}。\n这个 demo 只支持 KDE X11 / Wayland。`
    );
    // 结束进程，避免用户误判成功。
    process.exit(1);
  }

  // 按会话类型检查对应的输入模拟工具。
  try {
    if (sessionType === "wayland") {
      // Wayland 下需要 ydotool 可用，并且程序会自动拉起 ydotoold。
      execFileSync("sh", ["-lc", "command -v ydotool >/dev/null"], {
        stdio: "ignore",
      });
      execFileSync("sh", ["-lc", "command -v pkexec >/dev/null"], {
        stdio: "ignore",
      });
      ensureYdotooldRunning();
    } else {
      // X11 下继续确认 xdotool 在 PATH 里可解析。
      execFileSync("sh", ["-lc", "command -v xdotool >/dev/null"], {
        stdio: "ignore",
      });
    }
  } catch {
    const toolName = sessionType === "wayland" ? "ydotool/pkexec" : "xdotool";
    // 缺工具时明确告诉用户怎么装。
    showError("缺少输入工具", `请先安装 ${toolName}。`);
    // 结束进程，避免后续点击时报错。
    process.exit(1);
  }
}

function isSupportedSessionType(value: string): value is SessionType {
  return supportedSessionTypes.includes(value as SessionType);
}

// 统一错误弹窗。
function showError(title: string, text: string): void {
  // 使用原生消息框展示错误。
  const messageBox = new QMessageBox();
  messageBox.setText(title);
  messageBox.setInformativeText(text);
  messageBox.exec();
}

function ensureLogDir(): void {
  mkdirSync(logDir, { recursive: true });
}

function appendLog(message: string): void {
  ensureLogDir();
  appendFileSync(logFilePath, `${new Date().toISOString()} ${message}\n`, {
    encoding: "utf8",
  });
}

function readClipboardText(): string {
  const clipboardAny = clipboard as unknown as { text?: () => string };
  return clipboardAny.text?.() ?? "";
}

function writeClipboardText(text: string, sessionType: SessionType): void {
  if (sessionType === "wayland") {
    appendLog(`clipboard write via wl-copy phrase=${JSON.stringify(text)}`);
    execFileSync("wl-copy", [], {
      input: text,
      stdio: ["pipe", "ignore", "ignore"],
    });
    return;
  }

  appendLog(`clipboard write via qt clipboard phrase=${JSON.stringify(text)}`);
  clipboard?.setText(text, QClipboardMode.Clipboard);
}

function readWaylandClipboardText(): string {
  return execFileSync("wl-paste", [], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function waitForClipboardText(expected: string, timeoutMs = 300): boolean {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (readClipboardText() === expected) {
      return true;
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }

  return false;
}

function waitForWaylandClipboardText(expected: string, timeoutMs = 300): boolean {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (readWaylandClipboardText() === expected) {
      return true;
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }

  return false;
}

function waitForSocketReady(socketPath: string, timeoutMs = 5000): boolean {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (existsSync(socketPath)) {
      return true;
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }

  return false;
}

function ensureYdotooldRunning(): void {
  appendLog(`ydotoold ensure requested socket=${JSON.stringify(ydotoolSocketPath)}`);

  if (waitForSocketReady(ydotoolSocketPath, 200)) {
    appendLog(`ydotoold socket already ready socket=${JSON.stringify(ydotoolSocketPath)}`);
    return;
  }

  if (existsSync(ydotooldPidFilePath)) {
    appendLog(`ydotoold pid file exists pidFile=${JSON.stringify(ydotooldPidFilePath)}`);
  }

  const startCommand = [
    "sh",
    "-lc",
    `setsid -f ydotoold -p ${JSON.stringify(ydotoolSocketPath)} -P 0666 >/dev/null 2>&1`,
  ];

  appendLog(`ydotoold start requested command=${JSON.stringify(startCommand)}`);

  execFileSync("pkexec", startCommand, { stdio: "ignore" });

  if (!waitForSocketReady(ydotoolSocketPath, 5000)) {
    appendLog(`ydotoold socket not ready after start socket=${JSON.stringify(ydotoolSocketPath)}`);
    showError(
      "ydotoold 启动失败",
      `已尝试自动启动 ydotoold，但 socket ${ydotoolSocketPath} 仍未就绪。`
    );
    process.exit(1);
  }

  appendLog(`ydotoold started socket=${JSON.stringify(ydotoolSocketPath)}`);
}

function getActiveWindowInfo(sessionType: SessionType): string {
  try {
    if (sessionType === "x11") {
      const windowId = execFileSync("sh", ["-lc", "xdotool getwindowfocus"], {
        encoding: "utf8",
      }).trim();
      const windowName = execFileSync(
        "sh",
        ["-lc", `xdotool getwindowname ${JSON.stringify(windowId)}`],
        { encoding: "utf8" }
      ).trim();
      return `window_id=${windowId || "unknown"} window_name=${windowName || "unknown"}`;
    }

    const result = execFileSync(
      "sh",
      ["-lc", "printf 'wayland-session (active window query not implemented)'"],
      { encoding: "utf8" }
    ).trim();
    return result || "unknown";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `unavailable: ${message}`;
  }
}

// 执行真正的“粘贴到当前焦点位置”动作。
function pastePhrase(phrase: string): void {
  try {
    const sessionType = (process.env.XDG_SESSION_TYPE ?? "").toLowerCase();
    const supportedSessionType = assertSupportedSessionType(sessionType);

    appendLog(
      `trigger phrase=${JSON.stringify(phrase)} sessionType=${supportedSessionType} activeWindow=${JSON.stringify(
        getActiveWindowInfo(supportedSessionType)
      )}`
    );

    // 先把目标句子写入标准剪贴板。
    writeClipboardText(phrase, supportedSessionType);
    appendLog(`clipboard set phrase=${JSON.stringify(phrase)}`);

    // 等剪贴板内容真正稳定下来，再继续往下走。
    if (supportedSessionType === "wayland") {
      if (!waitForWaylandClipboardText(phrase)) {
        appendLog(
          `clipboard verify failed expected=${JSON.stringify(phrase)} actual=${JSON.stringify(readWaylandClipboardText())}`
        );
        showError("粘贴失败", "Wayland 剪贴板内容未稳定到当前选中的文案。");
        return;
      }
    } else if (!waitForClipboardText(phrase)) {
      appendLog(
        `clipboard verify failed expected=${JSON.stringify(phrase)} actual=${JSON.stringify(readClipboardText())}`
      );
      showError("粘贴失败", "剪贴板内容未稳定到当前选中的文案。");
      return;
    }

    appendLog(`clipboard verify ok phrase=${JSON.stringify(phrase)} sessionType=${supportedSessionType}`);

    // 给系统足够时间把焦点切回目标窗口，再发粘贴快捷键。
    setTimeout(() => {
      try {
        const activeWindowBeforePaste = getActiveWindowInfo(supportedSessionType);
    appendLog(
      `before paste sessionType=${supportedSessionType} activeWindow=${JSON.stringify(
        activeWindowBeforePaste
      )} shortcut=alt+v socket=${JSON.stringify(ydotoolSocketPath)}`
    );

        // 按当前会话类型发送原生粘贴快捷键。
        sendPasteShortcut(supportedSessionType);
        appendLog(`paste shortcut sent shortcut=alt+v sessionType=${supportedSessionType}`);

        // 成功后给个轻提示，便于观察是否触发。
        tray.showMessage("已粘贴", phrase, trayIcon, 1500);
        appendLog(`paste completed phrase=${JSON.stringify(phrase)}`);
      } catch (error) {
        // 失败时展示原始错误，便于排查环境问题。
        const message = error instanceof Error ? error.message : String(error);
        appendLog(`paste failed message=${JSON.stringify(message)}`);
        // 汇总成可读提示。
        showError("粘贴失败", message);
      }
    }, pasteDelayMs);
  } catch (error) {
    // 失败时展示原始错误，便于排查环境问题。
    const message = error instanceof Error ? error.message : String(error);
    appendLog(`trigger failed message=${JSON.stringify(message)}`);
    // 汇总成可读提示。
    showError("粘贴失败", message);
  }
}

function sendPasteShortcut(sessionType: SessionType): void {
  if (sessionType === "wayland") {
    // Wayland 下使用 ydotool 模拟 Alt+V。
    // ydotool key 需要 keycode 序列，56 是 Left Alt，47 是 V。
    execFileSync("ydotool", ["key", "56:1", "47:1", "47:0", "56:0"], {
      stdio: "ignore",
      env: {
        ...process.env,
        YDOTOOL_SOCKET: ydotoolSocketPath,
      },
    });
    return;
  }

  // X11 下使用 xdotool。
  execFileSync("xdotool", ["key", "--clearmodifiers", "alt+v"], {
    stdio: "ignore"
  });
}

function assertSupportedSessionType(value: string): SessionType {
  if (isSupportedSessionType(value)) {
    return value;
  }

  // 理论上 validateRuntime 已经拦住了这里；这里保留兜底，避免运行时分支失配。
  return "x11";
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
