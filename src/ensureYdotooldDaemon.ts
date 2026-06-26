import { findPkexecPath, findYdotooldPath, findYdotoolPath, startYdotooldDirect, startYdotooldWithPkexec, stopYdotooldDaemon } from "./utils/index.js";
import { waitForYdotooldReady } from "./waitForYdotooldReady.js";
import { inspectYdotooldReady } from "./inspectYdotooldReady.js";
import { daemonState, daemonSocketPath, daemonDirectStartTimeoutMs, daemonPkexecStartTimeoutMs, type DaemonStatus } from "./utils/_internal/index.js";

type EnsureDeps = {
  setDaemonStatus: (status: DaemonStatus, detail?: string) => void;
};

export async function ensureYdotooldDaemon(deps: EnsureDeps): Promise<void> {
  if (daemonState.startInFlight) {
    return;
  }

  daemonState.startInFlight = true;
  deps.setDaemonStatus("starting");

  try {
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

    const existingSocket = await inspectYdotooldReady(ydotoolPath);
    if (existingSocket.ok) {
      deps.setDaemonStatus("running");
      return;
    }

    stopYdotooldDaemon(daemonSocketPath);

    try {
      startYdotooldDirect(ydotooldPath, daemonSocketPath, {
        daemonOutputPath: undefined,
      });
      const directCheck = await waitForYdotooldReady(ydotoolPath, daemonDirectStartTimeoutMs);
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
      await startYdotooldWithPkexec(pkexecPath, ydotooldPath, daemonSocketPath, daemonPkexecStartTimeoutMs, {
        daemonOutputPath: undefined,
      });
    } catch (error) {
      deps.setDaemonStatus("failed", error instanceof Error ? error.message : String(error));
      return;
    }

    const pkexecCheck = await waitForYdotooldReady(ydotoolPath, daemonPkexecStartTimeoutMs);
    if (pkexecCheck.ok) {
      deps.setDaemonStatus("running");
      return;
    }

    deps.setDaemonStatus("failed", pkexecCheck.reason);
  } catch (error) {
    deps.setDaemonStatus("failed", error instanceof Error ? error.message : String(error));
  } finally {
    daemonState.startInFlight = false;
  }
}
