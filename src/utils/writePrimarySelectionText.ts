import { runCommandSync } from './_internal/index.js';

export function writePrimarySelectionText(text: string): void {
  console.log('### writePrimarySelectionText', { text });
  runCommandSync("wl-copy", ["--primary"], {
    input: text,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
