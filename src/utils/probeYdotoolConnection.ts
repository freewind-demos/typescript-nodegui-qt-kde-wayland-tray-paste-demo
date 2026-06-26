import { runYdotoolKeySequence } from './_internal/index.js';

const   ydotoolCtrlProbeKeySequence = ["29:1", "29:0"] as const;

export function probeYdotoolConnection(ydotoolPath: string, socketPath: string): void {
  runYdotoolKeySequence(ydotoolPath, socketPath, ydotoolCtrlProbeKeySequence);
}
