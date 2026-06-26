import { findYdotoolPath, probeYdotoolConnection, sendYdotoolPasteShortcut } from "./index.js";
import { inspectYdotoolSocket } from "./inspectYdotoolSocket.js";
import { daemonSocketPath, type DaemonStatus } from "./_internal/index.js";
import { ensureYdotooldDaemon } from "./ensureYdotooldDaemon.js";

type SendPasteShortcutDeps = {
  ensureYdotooldDaemon: () => void;
  setDaemonStatus: (status: DaemonStatus, detail?: string) => void;
  showYdotooldError: (title: string, detail: string) => void;
  showYdotoolExecutionError: (error: unknown, title: string) => void;
};

export async function sendPasteShortcut(deps: SendPasteShortcutDeps): Promise<boolean> {
  const ydotoolPath = findYdotoolPath();
  if (!ydotoolPath) {
    deps.showYdotooldError("ydotool 不可用", "系统里找不到 `ydotool`，请先安装 `ydotool`。");
    return false;
  }

  const socketCheck = inspectYdotoolSocket(daemonSocketPath);
  if (!socketCheck.ok) {
    deps.setDaemonStatus("starting", socketCheck.reason);
    void deps.ensureYdotooldDaemon();
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
    return true;
  } catch (error) {
    deps.showYdotoolExecutionError(error, "ydotool 执行失败");
    return false;
  }
}
