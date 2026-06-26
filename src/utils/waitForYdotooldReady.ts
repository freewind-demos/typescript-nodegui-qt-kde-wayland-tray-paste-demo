import { daemonSocketPollMs } from "./_internal/index.js";
import { inspectYdotooldReady } from "./inspectYdotooldReady.js";
import type { SocketCheck } from "./inspectYdotoolSocket.js";

export async function waitForYdotooldReady(ydotoolPath: string, timeoutMs: number): Promise<SocketCheck> {
  const deadline = Date.now() + timeoutMs;
  let lastCheck: SocketCheck | undefined;

  while (Date.now() < deadline) {
    lastCheck = await inspectYdotooldReady(ydotoolPath);
    if (lastCheck.ok) {
      return lastCheck;
    }
    await delay(daemonSocketPollMs);
  }

  return {
    ok: false,
    reason: lastCheck && !lastCheck.ok ? lastCheck.reason : "等待 `ydotoold` socket 可用超时。",
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
