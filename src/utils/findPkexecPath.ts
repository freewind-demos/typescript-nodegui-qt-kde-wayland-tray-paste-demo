import { findCommandPath } from "./_internal/index.js";

export function findPkexecPath(): string | undefined {
  console.log('### findPkexecPath', {});
  return findCommandPath("pkexec");
}
