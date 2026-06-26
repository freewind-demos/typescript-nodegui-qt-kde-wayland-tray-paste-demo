import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import type { CommandLogger } from '../index';

export function logCommand(log: CommandLogger | undefined, event: string, fields?: Record<string, unknown>): void {
  try {
    log?.(event, fields);
  } catch {
    // Logging must not change command behavior.
  }
}
