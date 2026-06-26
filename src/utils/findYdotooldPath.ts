import { findCommandPath } from "./_internal/index.js";

export function findYdotooldPath(): string | undefined {
  return findCommandPath("ydotoold");
}
