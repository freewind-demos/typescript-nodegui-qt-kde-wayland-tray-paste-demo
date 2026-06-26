import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

export type CommandError = Error & {
  code?: string | number;
  signal?: NodeJS.Signals | null;
  status?: number | null;
  stderr?: Buffer | string;
  stdout?: Buffer | string;
};
