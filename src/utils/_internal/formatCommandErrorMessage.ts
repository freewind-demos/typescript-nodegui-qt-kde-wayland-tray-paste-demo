import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

export function formatCommandErrorMessage(name: string, fields: Record<string, unknown>): string {
  return [
    `${name} failed.`,
    fields.status !== undefined ? `status=${String(fields.status)}` : undefined,
    fields.signal !== undefined ? `signal=${String(fields.signal)}` : undefined,
    fields.code !== undefined ? `code=${String(fields.code)}` : undefined,
    fields.message ? `message=${String(fields.message)}` : undefined,
    fields.stderr ? `stderr=${String(fields.stderr)}` : undefined,
    fields.stdout ? `stdout=${String(fields.stdout)}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
