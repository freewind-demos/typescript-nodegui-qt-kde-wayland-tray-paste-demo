import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

function escapeRegExp(value: string): string {
  console.log('### escapeRegExp', { value });
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stopYdotooldDaemon(socketPath: string): void {
  console.log('### stopYdotooldDaemon START', { socketPath });
  const pkillPattern = `ydotoold.*-p ${escapeRegExp(socketPath)}`;
  console.log('### stopYdotooldDaemon pkillPattern', { pkillPattern });
  try {
    console.log('### stopYdotooldDaemon ABOUT TO pkill');
    execFileSync("pkill", ["-f", pkillPattern], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    console.log('### stopYdotooldDaemon pkill done');
  } catch {
    console.log('### stopYdotooldDaemon pkill caught error');
    // Ignore missing or already-stopped daemon.
  }

  console.log('### stopYdotooldDaemon ABOUT TO rm');
  rmSync(socketPath, { force: true });
  console.log('### stopYdotooldDaemon rm done');
}
