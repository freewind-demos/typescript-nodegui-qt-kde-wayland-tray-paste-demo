import { accessSync, appendFileSync, constants, existsSync, mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
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
  type CommandLogger,
} from "./utils/index.js";

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
const projectRoot = join(currentDir, "..");
const logDirectory = join(projectRoot, "log");
const appLogPath = join(logDirectory, "paste.log");

const logEvent: CommandLogger = (event, fields = {}) => {
  try {
    mkdirSync(logDirectory, {
      recursive: true,
      mode: 0o755,
    });
    appendFileSync(appLogPath, `${new Date().toISOString()} ${event}${formatLogFields(fields)}\n`);
  } catch (error) {
    console.error("failed to write app log", error);
  }
};

type DaemonStatus = "failed" | "running" | "starting" | "stopped";

type SocketCheck =
  | { ok: true }
  | {
      ok: false;
      reason: string;
    };

const iconPathByDaemonStatus = {
  failed: join(projectRoot, "assets/tray-icon-failed.svg"),
  running: join(projectRoot, "assets/tray-icon-running.svg"),
  starting: join(projectRoot, "assets/tray-icon-starting.svg"),
  stopped: join(projectRoot, "assets/tray-icon-starting.svg"),
} satisfies Record<DaemonStatus, string>;
// Keep the file name short: Unix socket paths commonly cap at 108 bytes.
const ydotoolSocketPath = process.env.YDOTOOL_SOCKET ?? join(projectRoot, ".ydotool_socket");
const pasteDelayMs = 300;
const daemonDirectStartTimeoutMs = 3_000;
const daemonPkexecStartTimeoutMs = 30_000;
const daemonSocketPollMs = 250;
const daemonHealthCheckMs = 3_000;

logEvent("app start", {
  cwd: process.cwd(),
  env: pickRuntimeEnvironment(),
  execPath: process.execPath,
  gid: process.getgid?.(),
  logPath: appLogPath,
  node: process.version,
  pid: process.pid,
  platform: process.platform,
  projectRoot,
  socketPath: ydotoolSocketPath,
  uid: process.getuid?.(),
});

const daemonStatusText = {
  failed: "守护程序：启动失败",
  running: "守护程序：运行中",
  starting: "守护程序：正在启动",
  stopped: "守护程序：未运行",
} satisfies Record<DaemonStatus, string>;

// 创建托盘图标对象。
const daemonStatusIcons = {
  failed: new QIcon(iconPathByDaemonStatus.failed),
  running: new QIcon(iconPathByDaemonStatus.running),
  starting: new QIcon(iconPathByDaemonStatus.starting),
  stopped: new QIcon(iconPathByDaemonStatus.stopped),
} satisfies Record<DaemonStatus, QIcon>;

let daemonStatus: DaemonStatus = "stopped";
let daemonStartInFlight = false;
let daemonHealthTimer: ReturnType<typeof setInterval> | undefined;

// 创建托盘实例。
const tray = new QSystemTrayIcon();

// 创建右键菜单实例。
const menu = new QMenu();

// 保存 action 引用，防止被 GC。
const actions: QAction[] = [];

const daemonStatusAction = new QAction();
daemonStatusAction.setEnabled(false);
menu.addAction(daemonStatusAction);
actions.push(daemonStatusAction);
menu.addSeparator();

// 执行真正的“粘贴到当前焦点位置”动作。
function pastePhrase(phrase: string): void {
  logEvent("paste phrase requested", {
    phrase,
    phraseLength: phrase.length,
  });

  try {
    // 先把目标句子写入 Shift+Insert 实际消费的 primary selection。
    writePrimarySelectionText(phrase, logEvent);
    logEvent("primary selection write completed", {
      phraseLength: phrase.length,
    });

    // 给系统足够时间把焦点切回目标窗口，再发粘贴快捷键。
    setTimeout(async () => {
      try {
        // 只发送一次 Shift+Insert，对应 primary selection 粘贴。
        const pasted = await sendPasteShortcut();
        if (pasted) {
          // 成功后给个轻提示，便于观察是否触发。
          tray.showMessage("已粘贴", phrase, daemonStatusIcons.running, 1500);
          logEvent("paste phrase completed", {
            phraseLength: phrase.length,
          });
        }
      } catch (error) {
        logEvent("paste shortcut timer failed", errorLogFields(error));
        console.error(error);
      }
    }, pasteDelayMs);
  } catch (error) {
    logEvent("paste phrase failed", errorLogFields(error));
    console.error(error);
  }
}

async function sendPasteShortcut(): Promise<boolean> {
  logEvent("send paste shortcut requested", {
    socketPath: ydotoolSocketPath,
  });

  const ydotoolPath = findYdotoolPath();
  if (!ydotoolPath) {
    logEvent("send paste shortcut failed", {
      reason: "ydotool missing",
    });
    showYdotooldError("ydotool 不可用", "系统里找不到 `ydotool`，请先安装 `ydotool`。");
    return false;
  }
  logEvent("ydotool path resolved for paste", {
    ydotoolPath,
  });

  const socketCheck = await inspectYdotoolSocket(ydotoolSocketPath);
  if (!socketCheck.ok) {
    logEvent("send paste shortcut socket not ready", {
      reason: socketCheck.reason,
      socketPath: ydotoolSocketPath,
    });
    setDaemonStatus("starting", socketCheck.reason);
    void ensureYdotooldDaemon();
    showYdotooldError("ydotoold 尚未就绪", socketCheck.reason);
    return false;
  }

  try {
    // 先发一次单独的 LeftCtrl 按下/抬起，确认 socket 不只是存在，而是真的可用。
    probeYdotoolConnection(ydotoolPath, ydotoolSocketPath, logEvent);
  } catch (error) {
    logEvent("ydotool paste probe failed", errorLogFields(error));
    showYdotoolExecutionError(error, "ydotool 连接测试失败");
    return false;
  }

  setDaemonStatus("running");
  try {
    // Wayland 下只模拟一次 Shift+Insert。
    sendYdotoolPasteShortcut(ydotoolPath, ydotoolSocketPath, logEvent);
    logEvent("ydotool paste shortcut completed", {
      socketPath: ydotoolSocketPath,
      ydotoolPath,
    });
    return true;
  } catch (error) {
    logEvent("ydotool paste shortcut failed", errorLogFields(error));
    showYdotoolExecutionError(error, "ydotool 执行失败");
    return false;
  }
}

async function ensureYdotooldDaemon(): Promise<void> {
  if (daemonStartInFlight) {
    logEvent("ydotoold ensure skipped", {
      reason: "start already in flight",
      status: daemonStatus,
    });
    return;
  }

  daemonStartInFlight = true;
  setDaemonStatus("starting");
  logEvent("ydotoold ensure started", {
    directTimeoutMs: daemonDirectStartTimeoutMs,
    pkexecTimeoutMs: daemonPkexecStartTimeoutMs,
    socketPath: ydotoolSocketPath,
  });

  try {
    const ydotoolPath = findYdotoolPath();
    if (!ydotoolPath) {
      logEvent("ydotoold ensure failed", {
        reason: "ydotool missing",
      });
      setDaemonStatus("failed", "系统里找不到 `ydotool`，请先安装 `ydotool`。");
      return;
    }
    logEvent("ydotool path resolved", {
      ydotoolPath,
    });

    const ydotooldPath = findYdotooldPath();
    if (!ydotooldPath) {
      logEvent("ydotoold ensure failed", {
        reason: "ydotoold missing",
      });
      setDaemonStatus("failed", "系统里找不到 `ydotoold`，请先安装 `ydotool`。");
      return;
    }
    logEvent("ydotoold path resolved", {
      ydotooldPath,
    });

    const existingSocket = await inspectYdotooldReady(ydotoolPath);
    if (existingSocket.ok) {
      logEvent("ydotoold existing socket ready", {
        socketPath: ydotoolSocketPath,
      });
      setDaemonStatus("running");
      return;
    }
    logEvent("ydotoold existing socket not ready", {
      reason: existingSocket.reason,
      socketPath: ydotoolSocketPath,
    });

    stopYdotooldDaemon(ydotoolSocketPath, logEvent);

    let directStartReason: string | undefined;
    try {
      startYdotooldDirect(ydotooldPath, ydotoolSocketPath, {
        daemonOutputPath: appLogPath,
        log: logEvent,
      });
      const directCheck = await waitForYdotooldReady(ydotoolPath, daemonDirectStartTimeoutMs, "direct");
      if (directCheck.ok) {
        logEvent("ydotoold direct start ready", {
          socketPath: ydotoolSocketPath,
        });
        setDaemonStatus("running");
        return;
      }
      directStartReason = directCheck.reason;
      logEvent("ydotoold direct start not ready", {
        reason: directStartReason,
      });
      stopYdotooldDaemon(ydotoolSocketPath, logEvent);
    } catch (error) {
      directStartReason = error instanceof Error ? error.message : String(error);
      logEvent("ydotoold direct start threw", {
        ...errorLogFields(error),
        directStartReason,
      });
    }

    const pkexecPath = findPkexecPath();
    if (!pkexecPath) {
      logEvent("ydotoold ensure failed", {
        directStartReason,
        reason: "pkexec missing",
      });
      setDaemonStatus(
        "failed",
        [
          "直接启动 `ydotoold` 后没有通过可用性探测，且系统里找不到 `pkexec`，无法继续提权启动。",
          directStartReason ? `直接启动失败详情：${directStartReason}` : undefined,
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n")
      );
      return;
    }

    try {
      logEvent("ydotoold pkexec start requested", {
        pkexecPath,
        socketPath: ydotoolSocketPath,
        ydotooldPath,
      });
      await startYdotooldWithPkexec(pkexecPath, ydotooldPath, ydotoolSocketPath, daemonPkexecStartTimeoutMs, {
        daemonOutputPath: appLogPath,
        log: logEvent,
      });
      logEvent("ydotoold pkexec command completed", {
        socketPath: ydotoolSocketPath,
      });
    } catch (error) {
      const pkexecStartReason = error instanceof Error ? error.message : String(error);
      logEvent("ydotoold pkexec start failed", {
        ...errorLogFields(error),
        directStartReason,
        pkexecStartReason,
      });
      setDaemonStatus(
        "failed",
        [
          "直接启动和 `pkexec` 启动都没有成功。",
          directStartReason ? `直接启动失败详情：${directStartReason}` : undefined,
          `pkexec 启动失败详情：${pkexecStartReason}`,
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n")
      );
      return;
    }

    const pkexecCheck = await waitForYdotooldReady(ydotoolPath, daemonPkexecStartTimeoutMs, "pkexec");
    if (pkexecCheck.ok) {
      logEvent("ydotoold pkexec start ready", {
        socketPath: ydotoolSocketPath,
      });
      setDaemonStatus("running");
      return;
    }

    logEvent("ydotoold pkexec start not ready", {
      directStartReason,
      reason: pkexecCheck.reason,
    });
    setDaemonStatus(
      "failed",
      [
        "已通过 `pkexec` 请求启动 `ydotoold`，但 daemon 没有在限定时间内通过可用性探测。",
        directStartReason ? `直接启动失败详情：${directStartReason}` : undefined,
        `pkexec 启动后探测详情：${pkexecCheck.reason}`,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n")
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logEvent("ydotoold ensure threw", {
      ...errorLogFields(error),
      message,
    });
    setDaemonStatus("failed", message);
  } finally {
    daemonStartInFlight = false;
    logEvent("ydotoold ensure finished", {
      status: daemonStatus,
    });
  }
}

async function waitForYdotooldReady(ydotoolPath: string, timeoutMs: number, label: string): Promise<SocketCheck> {
  const deadline = Date.now() + timeoutMs;
  const startedAt = Date.now();
  let attempt = 0;
  let lastCheck: SocketCheck | undefined;

  logEvent("ydotoold wait started", {
    label,
    pollMs: daemonSocketPollMs,
    timeoutMs,
    ydotoolPath,
  });

  while (Date.now() < deadline) {
    attempt += 1;
    lastCheck = await inspectYdotooldReady(ydotoolPath);
    if (lastCheck.ok) {
      logEvent("ydotoold wait ready", {
        attempt,
        elapsedMs: Date.now() - startedAt,
        label,
      });
      return lastCheck;
    }

    logEvent("ydotoold wait attempt not ready", {
      attempt,
      elapsedMs: Date.now() - startedAt,
      label,
      reason: lastCheck.reason,
    });
    await delay(daemonSocketPollMs);
  }

  logEvent("ydotoold wait timed out", {
    attempts: attempt,
    elapsedMs: Date.now() - startedAt,
    label,
    lastReason: lastCheck && !lastCheck.ok ? lastCheck.reason : undefined,
    timeoutMs,
  });

  return {
    ok: false,
    reason: [
      "等待 `ydotoold` socket 可用超时。",
      "如果系统弹出了授权窗口，请确认已经允许本程序通过 polkit 启动 `ydotoold`。",
      lastCheck && !lastCheck.ok ? `最后一次探测结果：${lastCheck.reason}` : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
  };
}

async function inspectYdotooldReady(ydotoolPath: string): Promise<SocketCheck> {
  logEvent("ydotoold readiness inspect started", {
    socketPath: ydotoolSocketPath,
    ydotoolPath,
  });
  const socketCheck = await inspectYdotoolSocket(ydotoolSocketPath);
  if (!socketCheck.ok) {
    logEvent("ydotoold readiness socket failed", {
      reason: socketCheck.reason,
      socketPath: ydotoolSocketPath,
    });
    return socketCheck;
  }

  try {
    probeYdotoolConnection(ydotoolPath, ydotoolSocketPath, logEvent);
    logEvent("ydotoold readiness probe ok", {
      socketPath: ydotoolSocketPath,
      ydotoolPath,
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logEvent("ydotoold readiness probe failed", {
      ...errorLogFields(error),
      socketPath: ydotoolSocketPath,
      ydotoolPath,
    });
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

function formatLogFields(fields: Record<string, unknown>): string {
  const text = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${formatLogValue(value)}`)
    .join(" ");
  return text ? ` ${text}` : "";
}

function formatLogValue(value: unknown): string {
  if (value instanceof Error) {
    return JSON.stringify({
      message: value.message,
      name: value.name,
      stack: value.stack,
    });
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  const json = JSON.stringify(value);
  return json === undefined ? JSON.stringify(String(value)) : json;
}

function errorLogFields(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack,
    };
  }

  return {
    errorMessage: String(error),
  };
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
    YDOTOOL_SOCKET: process.env.YDOTOOL_SOCKET,
  };
}

async function inspectYdotoolSocket(socketPath: string): Promise<SocketCheck> {
  logEvent("ydotool socket inspect started", {
    socketPath,
  });

  if (!existsSync(socketPath)) {
    logEvent("ydotool socket missing", {
      socketPath,
    });
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
    logEvent("ydotool socket stat", {
      ...socketStatLogFields(socketPath),
      socketPath,
    });
    if (!stats.isSocket()) {
      logEvent("ydotool socket invalid type", {
        ...socketStatLogFields(socketPath),
        socketPath,
      });
      return {
        ok: false,
        reason: [
          "检测到的路径不是 socket。",
          `当前检查的路径是：${socketPath}`,
        ].join("\n"),
      };
    }

    accessSync(socketPath, constants.W_OK);
    // ydotoold 的 Unix socket 不能用 Node net 当普通 stream socket 探测；真实可用性在粘贴前用 ydotool 自己确认。
    logEvent("ydotool socket writable", {
      ...socketStatLogFields(socketPath),
      socketPath,
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logEvent("ydotool socket inspect failed", {
      ...errorLogFields(error),
      ...socketStatLogFields(socketPath),
      socketPath,
    });
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
  const icon = daemonStatusIcons[status];
  daemonStatusAction.setText(text);
  daemonStatusAction.setIcon(icon);
  tray.setIcon(icon);
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
  daemonHealthTimer = setInterval(() => {
    void refreshDaemonStatus();
  }, daemonHealthCheckMs);
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

// 设置初始托盘状态。
setDaemonStatus("stopped");

// 绑定菜单。
tray.setContextMenu(menu);

// 展示托盘。
tray.show();

void ensureYdotooldDaemon();
startDaemonHealthCheck();

// 保留关键对象到全局，防止 Qt 对象被回收。
(globalThis as typeof globalThis & {
  tray?: QSystemTrayIcon;
  menu?: QMenu;
  actions?: QAction[];
  daemonHealthTimer?: ReturnType<typeof setInterval>;
}).tray = tray;

// 保留菜单引用。
(globalThis as typeof globalThis & {
  tray?: QSystemTrayIcon;
  menu?: QMenu;
  actions?: QAction[];
  daemonHealthTimer?: ReturnType<typeof setInterval>;
}).menu = menu;

// 保留 action 列表引用。
(globalThis as typeof globalThis & {
  tray?: QSystemTrayIcon;
  menu?: QMenu;
  actions?: QAction[];
  daemonHealthTimer?: ReturnType<typeof setInterval>;
}).actions = actions;

// 保留 daemon 监控 timer 引用。
(globalThis as typeof globalThis & {
  tray?: QSystemTrayIcon;
  menu?: QMenu;
  actions?: QAction[];
  daemonHealthTimer?: ReturnType<typeof setInterval>;
}).daemonHealthTimer = daemonHealthTimer;

// 进入 Qt 事件循环。
app.exec();
