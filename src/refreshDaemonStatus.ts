import { findYdotoolPath } from "./utils/index.js";
import { inspectYdotooldReady } from "./inspectYdotooldReady.js";
import { daemonState, type DaemonStatus } from "./utils/_internal/index.js";

type RefreshDeps = {
  setDaemonStatus: (status: DaemonStatus, detail?: string) => void;
  ensureYdotooldDaemon: () => void;
};

export async function refreshDaemonStatus(deps: RefreshDeps): Promise<void> {
  if (daemonState.startInFlight) {
    return;
  }

  if (daemonState.status === "failed") {
    return;
  }

  const ydotoolPath = findYdotoolPath();
  if (!ydotoolPath) {
    deps.setDaemonStatus("failed", "系统里找不到 `ydotool`，请先安装 `ydotool`。");
    return;
  }

  const socketCheck = await inspectYdotooldReady(ydotoolPath);
  if (socketCheck.ok) {
    deps.setDaemonStatus("running");
    return;
  }

  deps.setDaemonStatus("stopped", socketCheck.reason);
  void deps.ensureYdotooldDaemon();
}
