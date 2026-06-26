import { findCommandPath } from "./_internal/index.js";

export function findYdotooldPath(): string | undefined {
  console.log('### findYdotooldPath', {});
  return findCommandPath("ydotoold");
}
