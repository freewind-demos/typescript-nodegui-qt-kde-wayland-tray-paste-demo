import { findCommandPath } from "./_internal/index.js";

export function findPkexecPath(): string | undefined {
  return findCommandPath("pkexec");
}
