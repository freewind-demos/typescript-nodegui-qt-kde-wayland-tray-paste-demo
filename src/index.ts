import {
  QAction,
  QApplication,
  ButtonRole,
  QIcon,
  QMenu,
  QMessageBox,
  QPushButton,
  QSystemTrayIcon,
  QSystemTrayIconActivationReason,
} from "@nodegui/nodegui";
import path from "path";
import { fileURLToPath } from "url";
import { writePrimarySelectionText } from "./utils/index.js";
import { probeYdotoolConnection, sendYdotoolPasteShortcut, findYdotoolPath, findYdotooldPath, findPkexecPath, stopYdotooldDaemon, startYdotooldDirect, startYdotooldWithPkexec } from "./utils/index.js";
import { inspectYdotooldReady } from "./utils/inspectYdotooldReady.js";
import { inspectYdotoolSocket, type SocketCheck } from "./utils/inspectYdotoolSocket.js";
import { waitForYdotooldReady } from "./utils/waitForYdotooldReady.js";
import { daemonState, daemonStatusText, daemonSocketPath, daemonDirectStartTimeoutMs, daemonPkexecStartTimeoutMs, type DaemonStatus } from "./utils/_internal/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const trayIconPath = path.resolve(__dirname, "..", "assets", "tray-icon.svg");

const phrases = [
  "你好，KDE 托盘粘贴测试。",
  "今天先把这个小问题干掉。",
  "Paste from tray, then keep coding。",
  "中英混合 test，一次点击直接落字。",
  "光标停哪儿，这句话就去那儿。"
] as const;

const app = QApplication.instance();
app.setQuitOnLastWindowClosed(false);

const tray = new QSystemTrayIcon();
const menu = new QMenu();
const actions: QAction[] = [];

const daemonStatusAction = new QAction();
daemonStatusAction.setEnabled(false);
menu.addAction(daemonStatusAction);
actions.push(daemonStatusAction);
menu.addSeparator();

function pastePhrase(phrase: string): void {
  console.log('### pastePhrase', { phrase });
  try {
    writePrimarySelectionText(phrase);
    // Don't block the Qt event loop - run paste shortcut in background
    setTimeout(() => {
      try {
        const result = sendPasteShortcutSync({
          ensureYdotooldDaemon: () => ensureYdotooldDaemonSync({
            setDaemonStatus,
          }),
          setDaemonStatus,
          showYdotoolExecutionError,
          showYdotooldError,
        });
        console.log('### pastePhrase sendPasteShortcutSync result', { result });
      } catch (err) {
        console.error('### pastePhrase sendPasteShortcutSync ERROR', err);
      }
    });
  } catch (err) {
    console.error('### pastePhrase ERROR', err);
  }
}

function sendPasteShortcutSync(deps: SendPasteShortcutDeps): boolean {
  console.log('### sendPasteShortcutSync', {});
  const ydotoolPath = findYdotoolPath();
  if (!ydotoolPath) {
    deps.showYdotooldError("ydotool 不可用", "系统里找不到 `ydotool`，请先安装 `ydotool`。");
    return false;
  }

  const socketCheck = inspectYdotoolSocket(daemonSocketPath);
  if (!socketCheck.ok) {
    deps.setDaemonStatus("starting", socketCheck.reason);
    ensureYdotooldDaemonSync({ setDaemonStatus: deps.setDaemonStatus });
    deps.showYdotooldError("ydotoold 尚未就绪", socketCheck.reason);
    return false;
  }

  try {
    probeYdotoolConnection(ydotoolPath, daemonSocketPath);
  } catch (error) {
    deps.showYdotoolExecutionError(error, "ydotool 连接测试失败");
    return false;
  }

  deps.setDaemonStatus("running");
  try {
    sendYdotoolPasteShortcut(ydotoolPath, daemonSocketPath);
    console.log('### sendPasteShortcutSync SUCCESS');
    return true;
  } catch (error) {
    deps.showYdotoolExecutionError(error, "ydotool 执行失败");
    return false;
  }
}

type SendPasteShortcutDeps = {
  ensureYdotooldDaemon: () => void;
  setDaemonStatus: (status: DaemonStatus, detail?: string) => void;
  showYdotooldError: (title: string, detail: string) => void;
  showYdotoolExecutionError: (error: unknown, title: string) => void;
};

function ensureYdotooldDaemonSync(deps: { setDaemonStatus: (status: DaemonStatus, detail?: string) => void }): void {
  console.log('### ensureYdotooldDaemonSync', { deps });
  const ydotoolPath = findYdotoolPath();
  if (!ydotoolPath) {
    deps.setDaemonStatus("failed", "系统里找不到 `ydotool`，请先安装 `ydotool`。");
    return;
  }

  const ydotooldPath = findYdotooldPath();
  if (!ydotooldPath) {
    deps.setDaemonStatus("failed", "系统里找不到 `ydotoold`，请先安装 `ydotool`。");
    return;
  }

  const existingSocket = inspectYdotooldReady(ydotoolPath);
  if (existingSocket.ok) {
    deps.setDaemonStatus("running");
    return;
  }

  deps.setDaemonStatus("starting");
  stopYdotooldDaemon(daemonSocketPath);

  try {
    startYdotooldDirect(ydotooldPath, daemonSocketPath, { daemonOutputPath: undefined });
    const directCheck = waitForYdotooldReady(ydotoolPath, daemonDirectStartTimeoutMs);
    if (directCheck.ok) {
      deps.setDaemonStatus("running");
      return;
    }
    stopYdotooldDaemon(daemonSocketPath);
  } catch {
    // Fall through to pkexec.
  }

  const pkexecPath = findPkexecPath();
  if (!pkexecPath) {
    deps.setDaemonStatus("failed", "直接启动失败，且系统里找不到 `pkexec`，无法继续提权启动。");
    return;
  }

  try {
    startYdotooldWithPkexec(pkexecPath, ydotooldPath, daemonSocketPath, daemonPkexecStartTimeoutMs, { daemonOutputPath: undefined });
  } catch (error) {
    deps.setDaemonStatus("failed", error instanceof Error ? error.message : String(error));
    return;
  }

  const pkexecCheck = waitForYdotooldReady(ydotoolPath, daemonPkexecStartTimeoutMs);
  if (pkexecCheck.ok) {
    deps.setDaemonStatus("running");
    return;
  }

  deps.setDaemonStatus("failed", pkexecCheck.reason);
}

function setDaemonStatus(status: DaemonStatus, detail?: string): void {
  console.log('### setDaemonStatus', { status, detail });
  daemonState.status = status;
  daemonStatusAction.setText(daemonStatusText[status]);
  tray.setToolTip(
    [
      "KDE 托盘粘贴测试",
      daemonStatusText[status],
      `socket: ${daemonSocketPath}`,
      detail ? `详情: ${detail}` : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n")
  );
}

function showYdotooldError(title: string, detail: string): void {
  console.log('### showYdotooldError', { title, detail });
  const messageBox = new QMessageBox();
  messageBox.setText(title);
  messageBox.setInformativeText(
    [
      detail,
      `当前使用的 socket 路径：${daemonSocketPath}`,
      "程序启动时会自动尝试启动自己的 `ydotoold` 后台进程；请确认系统已安装 `ydotool`、`ydotoold` 和 `pkexec`，并允许 polkit 授权。",
    ].join("\n")
  );

  const okButton = new QPushButton();
  okButton.setText("确定");
  messageBox.addButton(okButton, ButtonRole.AcceptRole);

  messageBox.open();
}

function showYdotoolExecutionError(error: unknown, title: string): void {
  console.log('### showYdotoolExecutionError', { title, error });
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
tray.setIcon(new QIcon(trayIconPath));
tray.setContextMenu(menu);

// Workaround: manually show menu on activation to bypass qode tray menu bug
tray.addEventListener("activated", (reason: QSystemTrayIconActivationReason) => {
  console.log('### tray activated', { reason });
  if (reason === QSystemTrayIconActivationReason.Context || reason === QSystemTrayIconActivationReason.Trigger) {
    menu.exec();
  }
});

tray.show();
console.log('### TRAY show', { visible: tray.isVisible() });

void ensureYdotooldDaemonSync({
  setDaemonStatus,
});

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
