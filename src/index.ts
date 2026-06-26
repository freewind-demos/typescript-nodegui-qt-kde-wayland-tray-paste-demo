import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  QAction,
  QApplication,
  QClipboardMode,
  QIcon,
  QMenu,
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

// 取到 qode 预先创建好的 Qt 应用实例。
const app = QApplication.instance();

// 托盘应用不依赖主窗口存活。
app.setQuitOnLastWindowClosed(false);

// 拿到系统剪贴板对象。
const clipboard = QApplication.clipboard();

// 生成托盘图标路径。
const currentDir = fileURLToPath(new URL(".", import.meta.url));
const iconPath = join(currentDir, "../assets/tray-icon.svg");
const userRuntimeDir = process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 0}`;
const ydotoolSocketPath = process.env.YDOTOOL_SOCKET ?? join(userRuntimeDir, "ydotoold.sock");
const pasteDelayMs = 300;
let ydotooldStarted = false;

// 创建托盘图标对象。
const trayIcon = new QIcon(iconPath);

// 创建托盘实例。
const tray = new QSystemTrayIcon();

// 创建右键菜单实例。
const menu = new QMenu();

// 保存 action 引用，防止被 GC。
const actions: QAction[] = [];

function writePrimarySelectionText(text: string, sessionType: string): void {
  if (sessionType === "wayland") {
    execFileSync("wl-copy", ["--primary"], {
      input: text,
      stdio: ["pipe", "ignore", "ignore"],
    });
    return;
  }

  clipboard?.setText(text, QClipboardMode.Selection);
}

// 执行真正的“粘贴到当前焦点位置”动作。
function pastePhrase(phrase: string): void {
  try {
    const sessionType = (process.env.XDG_SESSION_TYPE ?? "").toLowerCase();

    // 先把目标句子写入 Shift+Insert 实际消费的 primary selection。
    writePrimarySelectionText(phrase, sessionType);

    // 给系统足够时间把焦点切回目标窗口，再发粘贴快捷键。
    setTimeout(() => {
      try {
        // 只发送一次 Shift+Insert，对应 primary selection 粘贴。
        sendPasteShortcut(sessionType);

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

function sendPasteShortcut(sessionType: string): void {
  if (sessionType === "wayland") {
    startYdotoold();
    // Wayland 下只模拟一次 Shift+Insert。
    execFileSync("ydotool", ["key", "42:1", "110:1", "110:0", "42:0"], {
      stdio: "ignore",
      env: {
        ...process.env,
        YDOTOOL_SOCKET: ydotoolSocketPath,
      },
    });
    return;
  }

  // X11 下只发送一次 Shift+Insert。
  execFileSync("xdotool", ["key", "--clearmodifiers", "Shift+Insert"], {
    stdio: "ignore"
  });
}

function startYdotoold(): void {
  if (ydotooldStarted) {
    return;
  }

  ydotooldStarted = true;

  try {
    execFileSync(
      "pkexec",
      [
        "sh",
        "-lc",
        `setsid -f ydotoold -p ${JSON.stringify(ydotoolSocketPath)} -P 0666 >/dev/null 2>&1`,
      ],
      { stdio: "ignore" }
    );
  } catch (error) {
    console.error(error);
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
