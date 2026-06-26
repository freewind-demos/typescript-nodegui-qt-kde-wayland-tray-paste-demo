import { spawn } from "node:child_process";

import { prepareYdotooldSocketPath } from "./_internal";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function startYdotooldWithPkexec(
  pkexecPath: string,
  ydotooldPath: string,
  socketPath: string,
  timeoutMs: number,
  options: { daemonOutputPath?: string } = {}
): Promise<void> {
  prepareYdotooldSocketPath(socketPath);

  const outputRedirect = options.daemonOutputPath ? ` >> ${shellQuote(options.daemonOutputPath)} 2>&1` : " >/dev/null 2>&1";
  const script = [
    `setsid -f ${shellQuote(ydotooldPath)} -p ${shellQuote(socketPath)} -P 0666${outputRedirect}`,
    "exit $?",
  ].join("; ");
  const daemonProcess = spawn(pkexecPath, ["sh", "-lc", script], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      settle(new Error("pkexec ydotoold timed out"));
      daemonProcess.kill("SIGTERM");
    }, timeoutMs);

    let settled = false;
    const settle = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    daemonProcess.once("error", (error) => {
      settle(error);
    });
    daemonProcess.once("exit", (code, signal) => {
      if (code === 0) {
        settle();
        return;
      }

      const exitReason = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
      settle(new Error(`pkexec ydotoold failed: ${exitReason}`));
    });
  });
}
