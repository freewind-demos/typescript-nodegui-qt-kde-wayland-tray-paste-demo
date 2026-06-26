import { findCommandPath } from "./_internal/index.js";

export function findYdotoolPath(): string | undefined {
  console.log('### findYdotoolPath', {});
  return findCommandPath("ydotool");
}
