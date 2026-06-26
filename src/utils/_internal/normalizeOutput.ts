import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

export function normalizeOutput(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.length > 4_000 ? `${trimmed.slice(0, 4_000)}...<truncated>` : trimmed;
}
