import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import { logCommand } from './logCommand';

import type { CommandLogger } from '../index';

export function prepareYdotooldSocketPath(socketPath: string, log?: CommandLogger): void {
  mkdirSync(dirname(socketPath), {
    recursive: true,
    mode: 0o755,
  });
  logCommand(log, "ydotoold socket directory ready", {
    directory: dirname(socketPath),
    socketPath,
  });
  rmSync(socketPath, { force: true });
  logCommand(log, "ydotoold stale socket removed before start", {
    socketPath,
  });
}
