import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import { runCommandSync } from './_internal';
import type { CommandLogger } from './index';

export function writePrimarySelectionText(text: string, log?: CommandLogger): void {
  runCommandSync("wl-copy", ["--primary"], {
    input: text,
    log,
    name: "wl-copy primary selection",
    stdio: ["pipe", "pipe", "pipe"],
  });
}
