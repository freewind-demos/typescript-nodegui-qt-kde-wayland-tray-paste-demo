import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import { findCommandPath } from './_internal';

export function findYdotoolPath(): string | undefined {
  return findCommandPath("ydotool");
}
