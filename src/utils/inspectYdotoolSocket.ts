import { accessSync, constants, existsSync, statSync } from "node:fs";

export type SocketCheck =
  | { ok: true }
  | {
      ok: false;
      reason: string;
    };

export function inspectYdotoolSocket(socketPath: string): SocketCheck {
  console.log('### inspectYdotoolSocket', { socketPath });
  if (!existsSync(socketPath)) {
    console.log("### 111")

    return {
      ok: false,
      reason: [
        "当前没有检测到 `ydotoold` 的 socket。",
        `当前检查的 socket 路径是：${socketPath}`,
      ].join("\n"),
    };
  }

  console.log("### 222")

  try {
    const stats = statSync(socketPath);
    if (!stats.isSocket()) {
      console.log("### 333")
      return {
        ok: false,
        reason: [
          "检测到的路径不是 socket。",
          `当前检查的路径是：${socketPath}`,
        ].join("\n"),
      };
    }

    console.log("### 444")

    accessSync(socketPath, constants.W_OK);
    return { ok: true };
  } catch (error) {
    console.log("### 555")

    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: [
        "检测到了 `ydotoold` 的 socket，但当前用户可能没有权限正常使用它。",
        `当前检查的 socket 路径是：${socketPath}`,
        `错误信息：${message}`,
      ].join("\n"),
    };
  }
}
