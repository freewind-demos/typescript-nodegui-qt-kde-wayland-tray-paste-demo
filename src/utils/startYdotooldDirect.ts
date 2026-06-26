import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { dirname } from "node:path";

import { prepareYdotooldSocketPath } from "./_internal/index.js";

function openDaemonOutputFile(
  daemonOutputPath: string | undefined
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

  return {
    closeParentFds: () => {
      closeSync(stdoutFd);
      closeSync(stderrFd);
    },
    stderrFd,
    stdoutFd,
  };
}

export function startYdotooldDirect(
  ydotooldPath: string,
  socketPath: string,
  options: { daemonOutputPath?: string } = {}
): ChildProcess {
  prepareYdotooldSocketPath(socketPath);

  const args = ["-p", socketPath, "-P", "0666"];
  const daemonOutput = openDaemonOutputFile(options.daemonOutputPath);
  const stdio: StdioOptions = daemonOutput ? ["ignore", daemonOutput.stdoutFd, daemonOutput.stderrFd] : "ignore";

  let daemonProcess: ChildProcess;
  try {
    daemonProcess = spawn(ydotooldPath, args, {
      detached: true,
      env: process.env,
      stdio,
    });
  } finally {
    daemonOutput?.closeParentFds();
  }

  daemonProcess.unref();
  return daemonProcess;
}
