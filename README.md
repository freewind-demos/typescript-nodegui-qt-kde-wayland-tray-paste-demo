# typescript-nodegui-qt-kde-wayland-tray-paste-demo

## 简介

这是一个给 Linux KDE 环境准备的最小托盘粘贴 demo。

它用 `NodeGui + TypeScript + Qt` 创建系统托盘图标，点击菜单里的某一句预置文本后，会把这句话粘贴到当前有焦点窗口的光标位置。

当前实现优先服务“验证 Shift+Insert 是否通”这个目标，所以只支持 `KDE + Wayland`。

- Wayland：`primary selection + wl-clipboard + ydotool + ydotoold + Shift+Insert`

## 快速开始

### 环境要求

- Linux
- KDE Plasma
- Wayland 会话
- Node.js
- `pnpm`
- Wayland 下还需要 `wl-copy`
- Wayland 下还需要 `pkexec`，用于拉起 `ydotoold`
- Wayland 下还需要 `ydotool`
- NodeGui 运行所需 Qt 依赖

### 安装依赖

```bash
pnpm install
```

### 运行

```bash
pnpm run dev
```

## 注意事项

- 这个 demo 不是“直接向别的进程注入文本”，而是“先写 primary selection，再模拟 `Shift+Insert`”。
- 所以目标输入框/编辑器本身要支持 `Shift+Insert` 从 primary selection 粘贴。
- Wayland 下使用 `ydotool`，它依赖 `uinput`，程序会在第一次 Wayland 粘贴时尝试拉起 `ydotoold`。
- 如果缺少对应工具，请先安装 `wl-copy`、`pkexec` 或 `ydotool`。
- 默认会在写入剪贴板后等待约 `300ms` 再发送粘贴快捷键。

## 教程

1. 托盘部分使用 `QSystemTrayIcon + QMenu + QAction`。
2. 菜单里放了 5 句测试文案，中英混合，便于验证编码与输入行为。
3. 点击某一项后：
   - 先把该句写入 primary selection。
   - 用 `wl-copy --primary` 写入，再调用 `ydotool` 模拟 `Shift+Insert`。
   - 焦点窗口收到 `Shift+Insert` 后，从 primary selection 在当前光标位置插入文本。
4. 如果后面要支持更复杂的 Wayland 场景，通常还会涉及桌面 portal、输入法框架接口，或 KDE/系统级自动化能力；那会比这个 demo 更复杂。
