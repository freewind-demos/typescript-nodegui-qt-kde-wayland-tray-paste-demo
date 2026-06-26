import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

export function prepareYdotooldSocketPath(socketPath: string): void {
  mkdirSync(dirname(socketPath), {
    recursive: true,
    mode: 0o755,
  });
  rmSync(socketPath, { force: true });
}
