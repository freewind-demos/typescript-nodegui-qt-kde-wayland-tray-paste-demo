import { accessSync, constants, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  QAction,
  QApplication,
  ButtonRole,
  QMenu,
  QMessageBox,
  QPushButton,
  QSystemTrayIcon,
} from "@nodegui/nodegui";
import {
  findPkexecPath,
  findYdotooldPath,
  findYdotoolPath,
  probeYdotoolConnection,
  sendYdotoolPasteShortcut,
  startYdotooldDirect,
  startYdotooldWithPkexec,
  stopYdotooldDaemon,
  writePrimarySelectionText,
} from "./utils/index.js";

const phrases = [
  "你好，KDE 托盘粘贴测试。",
  "今天先把这个小问题干掉。",
  "Paste from tray, then keep coding.",
  "中英混合 test，一次点击直接落字。",
  "光标停哪儿，这句话就去那儿。"
] as const;

const app = QApplication.instance();
app.setQuitOnLastWindowClosed(false);

const currentDir = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = join(currentDir, "..");

type DaemonStatus = "failed" | "running" | "starting" | "stopped";

type SocketCheck =
  | { ok: true }
  | {
      ok: false;
      reason: string;
    };

const ydotoolSocketPath = join(projectRoot, ".ydotool_socket");
const pasteDelayMs = 300;
const daemonDirectStartTimeoutMs = 3_000;
const daemonPkexecStartTimeoutMs = 30_000;
const daemonSocketPollMs = 250;

const daemonStatusText = {
  failed: "守护程序：启动失败",
  running: "守护程序：运行中",
  starting: "守护程序：正在启动",
  stopped: "守护程序：未运行",
} satisfies Record<DaemonStatus, string>;

let daemonStatus: DaemonStatus = "stopped";
let daemonStartInFlight = false;

const tray = new QSystemTrayIcon();
const menu = new QMenu();
const actions: QAction[] = [];

const daemonStatusAction = new QAction();
daemonStatusAction.setEnabled(false);
menu.addAction(daemonStatusAction);
actions.push(daemonStatusAction);
menu.addSeparator();

function pastePhrase(phrase: string): void {
  try {
    writePrimarySelectionText(phrase);
    setTimeout(async () => {
      try {
        const pasted = await sendPasteShortcut();
        if (pasted) {
          tray.showMessage("已粘贴", phrase);
        }
      } catch {
        // Ignore paste shortcut errors.
      }
    }, pasteDelayMs);
  } catch {
    // Ignore paste failures.
  }
}

async function sendPasteShortcut(): Promise<boolean> {
  const ydotoolPath = findYdotoolPath();
  if (!ydotoolPath) {
    showYdotooldError("ydotool 不可用", "系统里找不到 `ydotool`，请先安装 `ydotool`。");
    return false;
  }

  const socketCheck = await inspectYdotoolSocket(ydotoolSocketPath);
  if (!socketCheck.ok) {
    setDaemonStatus("starting", socketCheck.reason);
    void ensureYdotooldDaemon();
    showYdotooldError("ydotoold 尚未就绪", socketCheck.reason);
    return false;
  }

  try {
    probeYdotoolConnection(ydotoolPath, ydotoolSocketPath);
  } catch (error) {
    showYdotoolExecutionError(error, "ydotool 连接测试失败");
    return false;
  }

  setDaemonStatus("running");
  try {
    sendYdotoolPasteShortcut(ydotoolPath, ydotoolSocketPath);
    return true;
  } catch (error) {
    showYdotoolExecutionError(error, "ydotool 执行失败");
    return false;
  }
}

async function ensureYdotooldDaemon(): Promise<void> {
  if (daemonStartInFlight) {
    return;
  }

  daemonStartInFlight = true;
  setDaemonStatus("starting");

  try {
    const ydotoolPath = findYdotoolPath();
    if (!ydotoolPath) {
      setDaemonStatus("failed", "系统里找不到 `ydotool`，请先安装 `ydotool`。");
      return;
    }

    const ydotooldPath = findYdotooldPath();
    if (!ydotooldPath) {
      setDaemonStatus("failed", "系统里找不到 `ydotoold`，请先安装 `ydotool`。");
      return;
    }

    const existingSocket = await inspectYdotooldReady(ydotoolPath);
    if (existingSocket.ok) {
      setDaemonStatus("running");
      return;
    }

    stopYdotooldDaemon(ydotoolSocketPath);

    try {
      startYdotooldDirect(ydotooldPath, ydotoolSocketPath, {
        daemonOutputPath: undefined,
      });
      const directCheck = await waitForYdotooldReady(ydotoolPath, daemonDirectStartTimeoutMs);
      if (directCheck.ok) {
        setDaemonStatus("running");
        return;
      }
      stopYdotooldDaemon(ydotoolSocketPath);
    } catch {
      // Fall through to pkexec.
    }

    const pkexecPath = findPkexecPath();
    if (!pkexecPath) {
      setDaemonStatus("failed", "直接启动失败，且系统里找不到 `pkexec`，无法继续提权启动。");
      return;
    }

    try {
      await startYdotooldWithPkexec(pkexecPath, ydotooldPath, ydotoolSocketPath, daemonPkexecStartTimeoutMs, {
        daemonOutputPath: undefined,
      });
    } catch (error) {
      setDaemonStatus("failed", error instanceof Error ? error.message : String(error));
      return;
    }

    const pkexecCheck = await waitForYdotooldReady(ydotoolPath, daemonPkexecStartTimeoutMs);
    if (pkexecCheck.ok) {
      setDaemonStatus("running");
      return;
    }

    setDaemonStatus("failed", pkexecCheck.reason);
  } catch (error) {
    setDaemonStatus("failed", error instanceof Error ? error.message : String(error));
  } finally {
    daemonStartInFlight = false;
  }
}

async function waitForYdotooldReady(ydotoolPath: string, timeoutMs: number): Promise<SocketCheck> {
  const deadline = Date.now() + timeoutMs;
  let lastCheck: SocketCheck | undefined;

  while (Date.now() < deadline) {
    lastCheck = await inspectYdotooldReady(ydotoolPath);
    if (lastCheck.ok) {
      return lastCheck;
    }
    await delay(daemonSocketPollMs);
  }

  return {
    ok: false,
    reason: lastCheck && !lastCheck.ok ? lastCheck.reason : "等待 `ydotoold` socket 可用超时。",
  };
}

async function inspectYdotooldReady(ydotoolPath: string): Promise<SocketCheck> {
  const socketCheck = await inspectYdotoolSocket(ydotoolSocketPath);
  if (!socketCheck.ok) {
    return socketCheck;
  }

  try {
    probeYdotoolConnection(ydotoolPath, ydotoolSocketPath);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: [
        "检测到了 `ydotoold` 的 socket，但 `ydotool` 无法通过它完成连接测试。",
        `当前检查的 socket 路径是：${ydotoolSocketPath}`,
        `错误信息：${message}`,
      ].join("\n"),
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function socketStatLogFields(socketPath: string): Record<string, unknown> {
  try {
    const stats = statSync(socketPath);
    return {
      socketGid: stats.gid,
      socketIsSocket: stats.isSocket(),
      socketMode: `0${(stats.mode & 0o777).toString(8)}`,
      socketMtime: stats.mtime.toISOString(),
      socketSize: stats.size,
      socketUid: stats.uid,
    };
  } catch (error) {
    return {
      socketStatError: error instanceof Error ? error.message : String(error),
    };
  }
}

function pickRuntimeEnvironment(): Record<string, string | undefined> {
  return {
    DISPLAY: process.env.DISPLAY,
    KDE_FULL_SESSION: process.env.KDE_FULL_SESSION,
    WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY,
    XDG_CURRENT_DESKTOP: process.env.XDG_CURRENT_DESKTOP,
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
    XDG_SESSION_DESKTOP: process.env.XDG_SESSION_DESKTOP,
    XDG_SESSION_TYPE: process.env.XDG_SESSION_TYPE,
  };
}

async function inspectYdotoolSocket(socketPath: string): Promise<SocketCheck> {
  if (!existsSync(socketPath)) {
    return {
      ok: false,
      reason: [
        "当前没有检测到 `ydotoold` 的 socket。",
        `当前检查的 socket 路径是：${socketPath}`,
      ].join("\n"),
    };
  }

  try {
    const stats = statSync(socketPath);
    if (!stats.isSocket()) {
      return {
        ok: false,
        reason: [
          "检测到的路径不是 socket。",
          `当前检查的路径是：${socketPath}`,
        ].join("\n"),
      };
    }

    accessSync(socketPath, constants.W_OK);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: [
        "检测到了 `ydotoold` 的 socket，但当前用户可能没有权限正常使用它。",
        `当前检查的 socket 路径是：${socketPath}`,
        `错误信息：${message}`,
      ].join("\n"),
    };
  }
}

function setDaemonStatus(status: DaemonStatus, detail?: string): void {
  daemonStatus = status;

  const text = daemonStatusText[status];
  daemonStatusAction.setText(text);
  tray.setToolTip(
    [
      "KDE 托盘粘贴测试",
      text,
      `socket: ${ydotoolSocketPath}`,
      detail ? `详情: ${detail}` : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n")
  );
}

function showYdotooldError(title: string, detail: string): void {
  const messageBox = new QMessageBox();
  messageBox.setText(title);
  messageBox.setInformativeText(
    [
      detail,
      `当前使用的 socket 路径：${ydotoolSocketPath}`,
      "程序启动时会自动尝试启动自己的 `ydotoold` 后台进程；请确认系统已安装 `ydotool`、`ydotoold` 和 `pkexec`，并允许 polkit 授权。",
    ].join("\n")
  );

  const okButton = new QPushButton();
  okButton.setText("确定");
  messageBox.addButton(okButton, ButtonRole.AcceptRole);

  messageBox.exec();
}

function showYdotoolExecutionError(error: unknown, title: string): void {
  const message = error instanceof Error ? error.message : String(error);
  setDaemonStatus("failed", message);
  showYdotooldError(
    title,
    [
      "已检测到 `ydotoold` 的 socket，但 `ydotool` 执行失败。",
      "这通常意味着 socket 存在，但权限不足，或者 `ydotoold` 没有正常工作。",
      `错误信息：${message}`,
    ].join("\n")
  );
}

async function refreshDaemonStatus(): Promise<void> {
  if (daemonStartInFlight) {
    return;
  }

  if (daemonStatus === "failed") {
    return;
  }

  const ydotoolPath = findYdotoolPath();
  if (!ydotoolPath) {
    setDaemonStatus("failed", "系统里找不到 `ydotool`，请先安装 `ydotool`。");
    return;
  }

  const socketCheck = await inspectYdotooldReady(ydotoolPath);
  if (socketCheck.ok) {
    setDaemonStatus("running");
    return;
  }

  setDaemonStatus("stopped", socketCheck.reason);
  void ensureYdotooldDaemon();
}

function startDaemonHealthCheck(): void {
  setInterval(() => {
    void refreshDaemonStatus();
  }, 3_000);
}

for (const phrase of phrases) {
  const action = new QAction();
  action.setText(phrase);
  action.addEventListener("triggered", () => {
    pastePhrase(phrase);
  });
  menu.addAction(action);
  actions.push(action);
}

menu.addSeparator();

const quitAction = new QAction();
quitAction.setText("退出");
quitAction.addEventListener("triggered", () => {
  app.quit();
});
menu.addAction(quitAction);
actions.push(quitAction);

setDaemonStatus("stopped");
tray.setContextMenu(menu);
tray.show();

void ensureYdotooldDaemon();
startDaemonHealthCheck();

(globalThis as typeof globalThis & {
  tray?: QSystemTrayIcon;
  menu?: QMenu;
  actions?: QAction[];
}).tray = tray;

(globalThis as typeof globalThis & {
  tray?: QSystemTrayIcon;
  menu?: QMenu;
  actions?: QAction[];
}).menu = menu;

(globalThis as typeof globalThis & {
  tray?: QSystemTrayIcon;
  menu?: QMenu;
  actions?: QAction[];
}).actions = actions;

app.exec();
