import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  QAction,
  QApplication,
  QIcon,
  QMenu,
  QClipboardMode,
  QMessageBox,
  QPushButton,
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

// 取到 qode 预先创建好的 Qt 应用实例。
const app = QApplication.instance();

// 托盘应用不依赖主窗口存活。
app.setQuitOnLastWindowClosed(false);

// 生成托盘图标路径。
const currentDir = fileURLToPath(new URL(".", import.meta.url));
const iconPath = join(currentDir, "../assets/tray-icon.svg");
const userRuntimeDir = process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 0}`;
const ydotoolSocketPath = process.env.YDOTOOL_SOCKET ?? join(userRuntimeDir, ".ydotool_socket");
const pasteDelayMs = 300;
const ydotooldCommand = `pkexec sh -lc 'setsid -f ydotoold -p ${JSON.stringify(ydotoolSocketPath)} -P 0666 >/dev/null 2>&1'`;

// 创建托盘图标对象。
const trayIcon = new QIcon(iconPath);

// 创建托盘实例。
const tray = new QSystemTrayIcon();

// 创建右键菜单实例。
const menu = new QMenu();

// 保存 action 引用，防止被 GC。
const actions: QAction[] = [];

function writePrimarySelectionText(text: string): void {
  execFileSync("wl-copy", ["--primary"], {
    input: text,
    stdio: ["pipe", "ignore", "ignore"],
  });
}

// 执行真正的“粘贴到当前焦点位置”动作。
function pastePhrase(phrase: string): void {
  try {
    // 先把目标句子写入 Shift+Insert 实际消费的 primary selection。
    writePrimarySelectionText(phrase);

    // 给系统足够时间把焦点切回目标窗口，再发粘贴快捷键。
    setTimeout(() => {
      try {
        // 只发送一次 Shift+Insert，对应 primary selection 粘贴。
        sendPasteShortcut();

        // 成功后给个轻提示，便于观察是否触发。
        tray.showMessage("已粘贴", phrase, trayIcon, 1500);
      } catch (error) {
        console.error(error);
      }
    }, pasteDelayMs);
  } catch (error) {
    console.error(error);
  }
}

function sendPasteShortcut(): void {
  if (!isCommandAvailable("ydotoold")) {
    showYdotooldMissingError("系统里找不到 `ydotoold`，请先安装 `ydotool`。");
    return;
  }

  const socketCheck = inspectYdotoolSocket(ydotoolSocketPath);
  if (!socketCheck.ok) {
    showYdotooldMissingError(
      socketCheck.reason ??
        [
          "当前没有检测到 `ydotoold` 正在运行。",
          `当前检查的 socket 路径是：${ydotoolSocketPath}`,
        ].join("\n")
    );
    return;
  }

  try {
    // Wayland 下只模拟一次 Shift+Insert。
    execFileSync("ydotool", ["key", "42:1", "110:1", "110:0", "42:0"], {
      stdio: "ignore",
      env: {
        ...process.env,
        YDOTOOL_SOCKET: ydotoolSocketPath,
      },
    });
  } catch (error) {
    showYdotoolExecutionError(error);
  }
}

function inspectYdotoolSocket(socketPath: string): { ok: boolean; reason?: string } {
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

function isCommandAvailable(commandName: string): boolean {
  try {
    execFileSync("sh", ["-lc", `command -v ${commandName} >/dev/null`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function showYdotooldMissingError(detail: string): void {
  const messageBox = new QMessageBox();
  messageBox.setText("ydotoold 启动失败");
  messageBox.setInformativeText(
    [
      detail,
      "如果想自动启动，请自行搜索 `ydotoold` 的自动启动方法。",
      "本次执行命令：",
      ydotooldCommand,
      "如果没有权限访问 uinput，请使用更高权限启动。",
    ].join("\n")
  );

  const runOnceButton = new QPushButton();
  runOnceButton.setText("复制本次执行代码");
  runOnceButton.addEventListener("clicked", () => {
    copyToClipboard(ydotooldCommand);
    messageBox.done(0);
  });
  messageBox.addButton(runOnceButton);

  messageBox.exec();
}

function showYdotoolExecutionError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  showYdotooldMissingError(
    [
      "已检测到 `ydotoold` 的 socket，但 `ydotool` 执行失败。",
      "这通常意味着 socket 存在，但权限不足，或者 `ydotoold` 没有正常工作。",
      `错误信息：${message}`,
    ].join("\n")
  );
}

function copyToClipboard(text: string): void {
  const clipboard = QApplication.clipboard();
  clipboard?.setText(text, QClipboardMode.Clipboard);
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
  app.quit();
});

// 加入菜单。
menu.addAction(quitAction);

// 也保留退出项引用。
actions.push(quitAction);

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
