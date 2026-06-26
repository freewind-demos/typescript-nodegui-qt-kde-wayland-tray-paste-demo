import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import { formatCommandErrorFields, logCommand } from './_internal';
import type { CommandLogger } from './index';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stopYdotooldDaemon(socketPath: string, log?: CommandLogger): void {
  const pkillPattern = `ydotoold.*-p ${escapeRegExp(socketPath)}`;
  logCommand(log, "ydotoold stop requested", {
    pkillPattern,
    socketPath,
  });

  try {
    execFileSync("pkill", ["-f", pkillPattern], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    logCommand(log, "ydotoold pkill completed", {
      pkillPattern,
      socketPath,
    });
  } catch (error) {
    // It is fine when there is no matching daemon, or when an old root-owned process cannot be killed.
    logCommand(log, "ydotoold pkill did not stop a process", {
      ...formatCommandErrorFields(error),
      pkillPattern,
      socketPath,
    });
  }

  rmSync(socketPath, { force: true });
  logCommand(log, "ydotoold socket removed", {
    socketPath,
  });
}
