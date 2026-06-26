import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stopYdotooldDaemon(socketPath: string): void {
  const pkillPattern = `ydotoold.*-p ${escapeRegExp(socketPath)}`;
  try {
    execFileSync("pkill", ["-f", pkillPattern], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    // Ignore missing or already-stopped daemon.
  }

  rmSync(socketPath, { force: true });
}
