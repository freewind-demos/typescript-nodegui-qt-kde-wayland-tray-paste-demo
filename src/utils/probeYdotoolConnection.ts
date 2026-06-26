import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import { runYdotoolKeySequence } from './_internal';
import type { CommandLogger } from './index';

const   ydotoolCtrlProbeKeySequence = ["29:1", "29:0"] as const;

export function probeYdotoolConnection(ydotoolPath: string, socketPath: string, log?: CommandLogger): void {
  runYdotoolKeySequence(ydotoolPath, socketPath, ydotoolCtrlProbeKeySequence, "ydotool probe", log);
}
