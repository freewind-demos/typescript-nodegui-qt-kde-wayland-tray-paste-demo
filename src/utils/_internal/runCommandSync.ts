import { spawnSync, type SpawnSyncOptions, type SpawnSyncReturns } from "node:child_process";

export function runCommandSync(
  command: string,
  args: string[],
  options?: {
    env?: NodeJS.ProcessEnv;
    input?: string;
    stdio?: SpawnSyncOptions["stdio"];
  }
): SpawnSyncReturns<string> {
  console.log('### runCommandSync', { command, args, options });
  return spawnSync(command, args, {
    encoding: "latin1",
    env: options?.env,
    input: options?.input,
    stdio: options?.stdio ?? ["ignore", "pipe", "pipe"],
  });
}
