import { runYdotoolKeySequence } from './_internal/index.js';

const   ydotoolPasteKeySequence = ["42:1", "110:1", "110:0", "42:0"] as const;

export function sendYdotoolPasteShortcut(ydotoolPath: string, socketPath: string): void {
  console.log('### sendYdotoolPasteShortcut', { ydotoolPath, socketPath });
  runYdotoolKeySequence(ydotoolPath, socketPath, ydotoolPasteKeySequence);
}
