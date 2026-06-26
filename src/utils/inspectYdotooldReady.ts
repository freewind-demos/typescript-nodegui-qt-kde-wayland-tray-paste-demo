import { probeYdotoolConnection } from "./index.js";
import { inspectYdotoolSocket, type SocketCheck } from "./inspectYdotoolSocket.js";
import { daemonSocketPath } from "./_internal/index.js";

export function inspectYdotooldReady(ydotoolPath: string): SocketCheck {
  console.log('### inspectYdotooldReady', { ydotoolPath });
  const socketCheck = inspectYdotoolSocket(daemonSocketPath);
  if (!socketCheck.ok) {
    console.log("### 432", socketCheck)
    console.log("### 433 about to return");
    return socketCheck;
  }
  console.log("### 433")

  try {
    probeYdotoolConnection(ydotoolPath, daemonSocketPath);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: [
        "检测到了 `ydotoold` 的 socket，但 `ydotool` 无法通过它完成连接测试。",
        `当前检查的 socket 路径是：${daemonSocketPath}`,
        `错误信息：${message}`,
      ].join("\n"),
    };
  }
}
