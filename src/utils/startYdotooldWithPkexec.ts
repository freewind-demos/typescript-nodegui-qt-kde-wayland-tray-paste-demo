import { spawn } from "node:child_process";

import { prepareYdotooldSocketPath } from "./_internal/index.js";

function shellQuote(value: string): string {
  console.log('### shellQuote', { value });
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function startYdotooldWithPkexec(
  pkexecPath: string,
  ydotooldPath: string,
  socketPath: string,
  timeoutMs: number,
  options: { daemonOutputPath?: string } = {}
): void {
  console.log('### startYdotooldWithPkexec START', { pkexecPath, ydotooldPath, socketPath, timeoutMs, options });
  prepareYdotooldSocketPath(socketPath);
  console.log('### startYdotooldWithPkexec AFTER prepare');

  const outputRedirect = options.daemonOutputPath ? ` >> ${shellQuote(options.daemonOutputPath)} 2>&1` : " >/dev/null 2>&1";
  console.log('### startYdotooldWithPkexec outputRedirect', { outputRedirect });
  const script = [`setsid -f ${shellQuote(ydotooldPath)} -p ${shellQuote(socketPath)} -P 0666${outputRedirect}`, "exit $?"].join("; ");
  console.log('### startYdotooldWithPkexec script', { script });
  console.log('### startYdotooldWithPkexec ABOUT TO SPAWN pkexec');
  const daemonProcess = spawn(pkexecPath, ["sh", "-lc", script], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log('### startYdotooldWithPkexec SPAWNED', { pid: daemonProcess.pid });

  console.log('### startYdotooldWithPkexec setting up error listener');
  daemonProcess.once("error", (error) => {
    console.log('### startYdotooldWithPkexec error event', error.message);
  });
  console.log('### startYdotooldWithPkexec setting up exit listener');
  daemonProcess.once("exit", (code, signal) => {
    console.log('### startYdotooldWithPkexec exit event', { code, signal });
  });
  console.log('### startYdotooldWithPkexec listeners setup done, reading stdout/stderr');

  daemonProcess.stdout?.on("data", (chunk: Buffer) => {
    console.log('### pkexec stdout', chunk.toString());
  });
  daemonProcess.stderr?.on("data", (chunk: Buffer) => {
    console.log('### pkexec stderr', chunk.toString());
  });
}
