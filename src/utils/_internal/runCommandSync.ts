import { execFileSync, type StdioOptions } from "node:child_process";

export function runCommandSync(
  command: string,
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    input?: string;
    name: string;
    stdio: ["ignore" | "pipe", "ignore" | "pipe", "ignore" | "pipe"];
  }
): Buffer | string {
  return execFileSync(command, args, {
    encoding: "buffer",
    env: options.env,
    input: options.input,
    stdio: options.stdio,
  });
}
