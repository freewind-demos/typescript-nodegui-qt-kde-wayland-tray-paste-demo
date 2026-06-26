import type { DaemonStatus } from "./daemonConstants.js";

export const daemonState: {
  startInFlight: boolean;
  status: DaemonStatus;
} = {
  startInFlight: false,
  status: "stopped",
};
