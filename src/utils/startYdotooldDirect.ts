import { execFileSync, spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync, rmSync } from "node:fs";
import { dirname } from "node:path";

import { formatCommandErrorFields, logCommand, prepareYdotooldSocketPath } from './_internal';
import type { StartYdotooldOptions } from './_internal';
import type { CommandLogger } from './index';

function openDaemonOutputFile(
  daemonOutputPath: string | undefined,
  log?: CommandLogger
): { closeParentFds: () => void; stderrFd: number; stdoutFd: number } | undefined {
  if (!daemonOutputPath) {
    return undefined;
  }

  mkdirSync(dirname(daemonOutputPath), {
    recursive: true,
    mode: 0o755,
  });
  const stdoutFd = openSync(daemonOutputPath, "a");
  const stderrFd = openSync(daemonOutputPath, "a");
  logCommand(log, "ydotoold output file opened", {
    daemonOutputPath,
  });

  return {
    closeParentFds: () => {
      closeSync(stdoutFd);
      closeSync(stderrFd);
      logCommand(log, "ydotoold output file parent fds closed", {
        daemonOutputPath,
      });
    },
    stderrFd,
    stdoutFd,
  };
}

export function startYdotooldDirect(
  ydotooldPath: string,
  socketPath: string,
  options: StartYdotooldOptions = {}
): ChildProcess {
  prepareYdotooldSocketPath(socketPath, options.log);

  const args = ["-p", socketPath, "-P", "0666"];
  const daemonOutput = openDaemonOutputFile(options.daemonOutputPath, options.log);
  const stdio: StdioOptions = daemonOutput ? ["ignore", daemonOutput.stdoutFd, daemonOutput.stderrFd] : "ignore";

  let daemonProcess: ChildProcess;
  try {
    logCommand(options.log, "ydotoold direct spawn requested", {
      args,
      daemonOutputPath: options.daemonOutputPath,
      ydotooldPath,
    });
    daemonProcess = spawn(ydotooldPath, args, {
      detached: true,
      env: process.env,
      stdio,
    });
  } finally {
    daemonOutput?.closeParentFds();
  }

  daemonProcess.once("spawn", () => {
    logCommand(options.log, "ydotoold direct spawned", {
      pid: daemonProcess.pid,
      socketPath,
      ydotooldPath,
    });
  });
  daemonProcess.once("error", (error) => {
    logCommand(options.log, "ydotoold direct spawn error", {
      ...formatCommandErrorFields(error),
      socketPath,
      ydotooldPath,
    });
  });
  daemonProcess.once("exit", (code, signal) => {
    logCommand(options.log, "ydotoold direct exited", {
      code,
      signal,
      socketPath,
      ydotooldPath,
    });
  });
  daemonProcess.unref();
  return daemonProcess;
}
