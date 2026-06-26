import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { dirname } from "node:path";

import { prepareYdotooldSocketPath } from "./_internal/index.js";

function openDaemonOutputFile(
  daemonOutputPath: string | undefined
): { closeParentFds: () => void; stderrFd: number; stdoutFd: number } | undefined {
  console.log('### openDaemonOutputFile', { daemonOutputPath });
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
  console.log('### startYdotooldDirect START', { ydotooldPath, socketPath, options });
  prepareYdotooldSocketPath(socketPath);
  console.log('### startYdotooldDirect AFTER prepare');

  const args = ["-p", socketPath, "-P", "0666"];
  console.log('### startYdotooldDirect ARGS', { args });
  const daemonOutput = openDaemonOutputFile(options.daemonOutputPath);
  const stdio: StdioOptions = daemonOutput ? ["ignore", daemonOutput.stdoutFd, daemonOutput.stderrFd] : "ignore";
  console.log('### startYdotooldDirect STDIO', { stdio });

  let daemonProcess: ChildProcess;
  try {
    console.log('### startYdotooldDirect ABOUT TO SPAWN');
    daemonProcess = spawn(ydotooldPath, args, {
      detached: false,
      env: process.env,
      stdio,
    });
    console.log('### startYdotooldDirect SPAWNED', { pid: daemonProcess.pid });
  } catch (err) {
    console.error('### startYdotooldDirect SPAWN ERROR', err);
    throw err;
  } finally {
    daemonOutput?.closeParentFds();
  }

  console.log('### startYdotooldDirect RETURNING process');
  return daemonProcess;
}
