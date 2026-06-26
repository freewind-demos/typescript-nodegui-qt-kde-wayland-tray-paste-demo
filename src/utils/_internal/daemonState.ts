import type { DaemonStatus } from "./daemonConstants.js";

export const daemonState: {
  status: DaemonStatus;
} = {
  status: "stopped",
};
