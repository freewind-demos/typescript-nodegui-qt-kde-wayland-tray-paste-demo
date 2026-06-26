import {
  QAction,
  QApplication,
  ButtonRole,
  QIcon,
  QMenu,
  QMessageBox,
  QPushButton,
  QSystemTrayIcon,
} from "@nodegui/nodegui";
import path from "path";
import { fileURLToPath } from "url";
import { writePrimarySelectionText } from "./utils/index.js";
import { sendPasteShortcut } from "./utils/sendPasteShortcut.js";
import { ensureYdotooldDaemon } from "./utils/ensureYdotooldDaemon.js";
import { daemonState, daemonStatusText, daemonSocketPath, pasteDelayMs, type DaemonStatus } from "./utils/_internal/index.js";

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
    setTimeout(async () => {
      try {
        const pasted = await sendPasteShortcut({
          ensureYdotooldDaemon: () => void ensureYdotooldDaemon({
            setDaemonStatus,
          }),
          setDaemonStatus,
          showYdotoolExecutionError,
          showYdotooldError,
        });
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

  messageBox.exec();
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
tray.show();

void ensureYdotooldDaemon({
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
