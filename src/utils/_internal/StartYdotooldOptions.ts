import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import type { CommandLogger } from '../index';

export type StartYdotooldOptions = {
  daemonOutputPath?: string;
  log?: CommandLogger;
};
