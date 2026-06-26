import { runCommandSync } from './runCommandSync.js';

export function runYdotoolKeySequence(
  ydotoolPath: string,
  socketPath: string,
  keySequence: readonly string[]
): void {
  runCommandSync(ydotoolPath, ["key", ...keySequence], {
    env: { ...process.env, YDOTOOL_SOCKET: socketPath },
    stdio: ["ignore", "pipe", "pipe"],
  });
}
