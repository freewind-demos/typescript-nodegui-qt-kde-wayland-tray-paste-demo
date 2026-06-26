import { runCommandSync } from './runCommandSync';

export function runYdotoolKeySequence(
  ydotoolPath: string,
  socketPath: string,
  keySequence: readonly string[]
): void {
  runCommandSync(ydotoolPath, ["key", ...keySequence], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
