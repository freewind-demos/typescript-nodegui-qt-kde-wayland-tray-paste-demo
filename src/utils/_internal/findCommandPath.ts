import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

export function findCommandPath(commandName: string): string | undefined {
  console.log('### findCommandPath', { commandName });
  try {
    const commandPath = execFileSync("sh", ["-lc", `command -v ${commandName}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return commandPath.length > 0 ? commandPath : undefined;
  } catch {
    return undefined;
  }
}
