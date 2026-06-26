import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const pasteDelayMs = 300;
export const daemonDirectStartTimeoutMs = 3_000;
export const daemonPkexecStartTimeoutMs = 30_000;
export const daemonSocketPollMs = 250;

const __dirname = dirname(fileURLToPath(new URL(".", import.meta.url)));
const projectRoot = dirname(__dirname);
export const daemonSocketPath = join(projectRoot, ".ydotool_sock");

export const daemonStatusText = {
  failed: "守护程序：启动失败",
  running: "守护程序：运行中",
  starting: "守护程序：正在启动",
  stopped: "守护程序：未运行",
} as const;

export type DaemonStatus = keyof typeof daemonStatusText;
