import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import { runYdotoolKeySequence } from './_internal';
import type { CommandLogger } from './index';

const   ydotoolPasteKeySequence = ["42:1", "110:1", "110:0", "42:0"] as const;

export function sendYdotoolPasteShortcut(ydotoolPath: string, socketPath: string, log?: CommandLogger): void {
  runYdotoolKeySequence(ydotoolPath, socketPath, ydotoolPasteKeySequence, "ydotool paste shortcut", log);
}
