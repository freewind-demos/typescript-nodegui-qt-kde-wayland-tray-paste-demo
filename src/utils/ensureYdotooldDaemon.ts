import { findPkexecPath, findYdotooldPath, findYdotoolPath, startYdotooldDirect, startYdotooldWithPkexec, stopYdotooldDaemon } from "./index.js";
import { waitForYdotooldReady } from "./waitForYdotooldReady.js";
import { inspectYdotooldReady } from "./inspectYdotooldReady.js";
import { daemonState, daemonSocketPath, daemonDirectStartTimeoutMs, daemonPkexecStartTimeoutMs, type DaemonStatus } from "./_internal/index.js";

type EnsureDeps = {
  setDaemonStatus: (status: DaemonStatus, detail?: string) => void;
};

export async function ensureYdotooldDaemon(deps: EnsureDeps): Promise<void> {
  console.log('### ensureYdotooldDaemon', { deps });
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
  console.log("### 776 no await anymore");
  console.log("### 777", existingSocket)
  if (existingSocket.ok) {
    deps.setDaemonStatus("running");
    return;
  }



  console.log("### 778")
  deps.setDaemonStatus("starting");
  console.log("### 779 setDaemonStatus done")
  stopYdotooldDaemon(daemonSocketPath);
  console.log("### 780 stopYdotooldDaemon done")

  try {
    console.log("### 781 ABOUT TO spawn direct");
    const proc = startYdotooldDirect(ydotooldPath, daemonSocketPath, {
      daemonOutputPath: undefined,
    });
    console.log("### 782 startYdotooldDirect returned", { pid: proc?.pid });
    const directCheck = waitForYdotooldReady(ydotoolPath, daemonDirectStartTimeoutMs);
    console.log("### 783 waitForYdotooldReady returned", { directCheck });
    if (directCheck.ok) {
      deps.setDaemonStatus("running");
      return;
    }
    console.log("### 784 direct check failed, stopping");
    stopYdotooldDaemon(daemonSocketPath);
    console.log("### 785 stopYdotooldDaemon done, falling through to pkexec");
  } catch (err) {
    console.error("### 786 DIRECT START CAUGHT ERROR", err);
    // Fall through to pkexec.
  }

  const pkexecPath = findPkexecPath();
  if (!pkexecPath) {
    deps.setDaemonStatus("failed", "直接启动失败，且系统里找不到 `pkexec`，无法继续提权启动。");
    return;
  }

  try {
    startYdotooldWithPkexec(pkexecPath, ydotooldPath, daemonSocketPath, daemonPkexecStartTimeoutMs, {
      daemonOutputPath: undefined,
    });
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
