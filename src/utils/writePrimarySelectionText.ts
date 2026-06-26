import { runCommandSync } from './_internal';

export function writePrimarySelectionText(text: string): void {
  runCommandSync("wl-copy", ["--primary"], {
    input: text,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
