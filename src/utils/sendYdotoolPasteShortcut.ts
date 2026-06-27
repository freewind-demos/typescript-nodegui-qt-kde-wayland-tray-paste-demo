import { runYdotoolKeySequence } from './_internal/index.js';

const   ydotoolPasteKeySequence = ["108:1", "118:1", "118:0", "108:0"] as const;

export function sendYdotoolPasteShortcut(ydotoolPath: string, socketPath: string): void {
  console.log('### sendYdotoolPasteShortcut', { ydotoolPath, socketPath });
  runYdotoolKeySequence(ydotoolPath, socketPath, ydotoolPasteKeySequence);
}
