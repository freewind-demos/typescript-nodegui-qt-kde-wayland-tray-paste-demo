import { findCommandPath } from "./_internal/index.js";

export function findYdotoolPath(): string | undefined {
  return findCommandPath("ydotool");
}
