import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import { CommandError } from './CommandError';
import { normalizeOutput } from './normalizeOutput';

export function formatCommandErrorFields(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
    };
  }

  const commandError = error as CommandError;
  return {
    code: commandError.code,
    message: commandError.message,
    signal: commandError.signal,
    status: commandError.status,
    stderr: normalizeOutput(commandError.stderr),
    stdout: normalizeOutput(commandError.stdout),
  };
}
