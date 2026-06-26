import { probeYdotoolConnection } from "./utils/index.js";
import { inspectYdotoolSocket, type SocketCheck } from "./inspectYdotoolSocket.js";
import { daemonSocketPath } from "./utils/_internal/index.js";

export async function inspectYdotooldReady(ydotoolPath: string): Promise<SocketCheck> {
  const socketCheck = inspectYdotoolSocket(daemonSocketPath);
  if (!socketCheck.ok) {
    return socketCheck;
  }

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
