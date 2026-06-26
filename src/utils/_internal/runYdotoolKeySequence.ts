import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import { runCommandSync } from './runCommandSync';

import type { CommandLogger } from '../index';

export function runYdotoolKeySequence(
  ydotoolPath: string,
  socketPath: string,
  keySequence: readonly string[],
  name: string,
  log?: CommandLogger
): void {
  runCommandSync(ydotoolPath, ["key", ...keySequence], {
    env: {
      ...process.env,
      YDOTOOL_SOCKET: socketPath,
    },
    log,
    name,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
