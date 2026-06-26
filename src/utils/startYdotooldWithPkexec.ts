import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import { formatCommandErrorFields, logCommand, normalizeOutput, prepareYdotooldSocketPath } from './_internal';
import type { StartYdotooldOptions } from './_internal';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function startYdotooldWithPkexec(
  pkexecPath: string,
  ydotooldPath: string,
  socketPath: string,
  timeoutMs: number,
  options: StartYdotooldOptions = {}
): Promise<void> {
  prepareYdotooldSocketPath(socketPath, options.log);

  const outputRedirect = options.daemonOutputPath ? ` >> ${shellQuote(options.daemonOutputPath)} 2>&1` : " >/dev/null 2>&1";
  const script = [
    options.daemonOutputPath
      ? `printf '%s %s\\n' "$(date -Is)" ${shellQuote(`[ydotoold-pkexec] launch ${ydotooldPath} -p ${socketPath} -P 0666`)} >> ${shellQuote(options.daemonOutputPath)}`
      : undefined,
    `setsid -f ${shellQuote(ydotooldPath)} -p ${shellQuote(socketPath)} -P 0666${outputRedirect}`,
    "status=$?",
    options.daemonOutputPath
      ? `printf '%s %s\\n' "$(date -Is)" "[ydotoold-pkexec] setsid exit=$status" >> ${shellQuote(options.daemonOutputPath)}`
      : undefined,
    "exit $status",
  ]
    .filter((line): line is string => Boolean(line))
    .join("; ");
  const startedAt = Date.now();
  logCommand(options.log, "ydotoold pkexec spawn requested", {
    pkexecPath,
    script,
    socketPath,
    timeoutMs,
    ydotooldPath,
  });
  const daemonProcess = spawn(pkexecPath, ["sh", "-lc", script], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    const outputChunks: Buffer[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      logCommand(options.log, "ydotoold pkexec timed out", {
        elapsedMs: Date.now() - startedAt,
        pid: daemonProcess.pid,
        socketPath,
        timeoutMs,
      });
      settle(new Error("pkexec ydotoold timed out; the polkit authorization prompt may be hidden or unanswered"));
      daemonProcess.kill("SIGTERM");
    }, timeoutMs);

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

    daemonProcess.stdout?.on("data", (data: Buffer) => {
      outputChunks.push(data);
      logCommand(options.log, "ydotoold pkexec stdout", {
        data: normalizeOutput(data),
        pid: daemonProcess.pid,
      });
    });
    daemonProcess.stderr?.on("data", (data: Buffer) => {
      outputChunks.push(data);
      logCommand(options.log, "ydotoold pkexec stderr", {
        data: normalizeOutput(data),
        pid: daemonProcess.pid,
      });
    });
    daemonProcess.once("spawn", () => {
      logCommand(options.log, "ydotoold pkexec spawned", {
        pid: daemonProcess.pid,
        socketPath,
      });
    });
    daemonProcess.once("error", (error) => {
      logCommand(options.log, "ydotoold pkexec spawn error", {
        ...formatCommandErrorFields(error),
        elapsedMs: Date.now() - startedAt,
        pid: daemonProcess.pid,
        socketPath,
      });
      settle(error);
    });
    daemonProcess.once("exit", (code, signal) => {
      const output = Buffer.concat(outputChunks).toString("utf8").trim();
      logCommand(options.log, "ydotoold pkexec exited", {
        code,
        elapsedMs: Date.now() - startedAt,
        output,
        pid: daemonProcess.pid,
        signal,
        socketPath,
      });
      if (code === 0) {
        settle();
        return;
      }

      const exitReason = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
      settle(new Error(`pkexec ydotoold failed: ${exitReason}${output ? ` (${output})` : ""}`));
    });
  });
}
