import { performance } from "node:perf_hooks";

export function sleepSync(ms: number): void {
  const target = performance.now() + ms;
  while (performance.now() < target) {
    // busy wait
  }
}
