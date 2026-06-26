import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

export function prepareYdotooldSocketPath(socketPath: string): void {
  console.log('### prepareYdotooldSocketPath START', { socketPath });
  const dir = dirname(socketPath);
  console.log('### prepareYdotooldSocketPath dirname', { dir });
  mkdirSync(dir, {
    recursive: true,
    mode: 0o755,
  });
  console.log('### prepareYdotooldSocketPath mkdir done');
  rmSync(socketPath, { force: true });
  console.log('### prepareYdotooldSocketPath rm done');
}
