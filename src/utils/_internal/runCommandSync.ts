import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import { formatCommandErrorFields } from './formatCommandErrorFields';
import { formatCommandErrorMessage } from './formatCommandErrorMessage';
import { logCommand } from './logCommand';
import { normalizeOutput } from './normalizeOutput';

import type { CommandLogger } from '../index';

export function runCommandSync(
  command: string,
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    input?: string;
    log?: CommandLogger;
    name: string;
    stdio: ["ignore" | "pipe", "ignore" | "pipe", "ignore" | "pipe"];
  }
): Buffer | string {
  const startedAt = Date.now();
  logCommand(options.log, "command start", {
    args,
    command,
    name: options.name,
  });

  try {
    const output = execFileSync(command, args, {
      encoding: "buffer",
      env: options.env,
      input: options.input,
      stdio: options.stdio,
    });
    logCommand(options.log, "command ok", {
      args,
      command,
      elapsedMs: Date.now() - startedAt,
      name: options.name,
      stdout: normalizeOutput(output),
    });
    return output;
  } catch (error) {
    const fields = formatCommandErrorFields(error);
    logCommand(options.log, "command failed", {
      ...fields,
      args,
      command,
      elapsedMs: Date.now() - startedAt,
      name: options.name,
    });
    throw new Error(formatCommandErrorMessage(options.name, fields));
  }
}
