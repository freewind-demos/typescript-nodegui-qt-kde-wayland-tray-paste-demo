import { daemonSocketPollMs } from "./_internal/index.js";
import { inspectYdotooldReady } from "./inspectYdotooldReady.js";
import type { SocketCheck } from "./inspectYdotoolSocket.js";
import { sleepSync } from "./_internal/sleepSync.js";

export function waitForYdotooldReady(ydotoolPath: string, timeoutMs: number): SocketCheck {
  console.log('### waitForYdotooldReady START', { ydotoolPath, timeoutMs });
  const deadline = Date.now() + timeoutMs;
  console.log('### waitForYdotooldReady deadline', { deadline });
  let lastCheck: SocketCheck | undefined;

  let iteration = 0;
  while (Date.now() < deadline) {
    iteration++;
    console.log(`### 543 iteration ${iteration}`, { now: Date.now(), deadline });
    const result = inspectYdotooldReady(ydotoolPath);
    console.log("### 544 inspect returned");
    lastCheck = result;
    console.log("### 765", lastCheck.ok, lastCheck);
    if (lastCheck.ok) {
      console.log("### 545 SOCKET READY!");
      return lastCheck;
    }
    console.log("### 546 about to sleep");
    sleepSync(daemonSocketPollMs);
    console.log("### 547 sleep done");
  }
  console.log("### 548 TIMEOUT reached");

  return {
    ok: false,
    reason: lastCheck && !lastCheck.ok ? lastCheck.reason : "等待 `ydotoold` socket 可用超时。",
  };
}
