# typescript-nodegui-qt-kde-tray-paste-demo

## 简介

这是一个给 Linux KDE 环境准备的最小托盘粘贴 demo。

它用 `NodeGui + TypeScript + Qt` 创建系统托盘图标，点击菜单里的某一句预置文本后，会把这句话粘贴到当前有焦点窗口的光标位置。

当前实现优先服务“验证粘贴是否通”这个目标，所以同时支持 `KDE + X11` 和 `KDE + Wayland`。

- X11：`clipboard + xdotool + Alt+V`
- Wayland：`clipboard + ydotool + Alt+V`

## 快速开始

### 环境要求

- Linux
- KDE Plasma
- X11 或 Wayland 会话
- Node.js
- `pnpm`
- `xdotool` 或 `ydotool`
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

- 这个 demo 不是“直接向别的进程注入文本”，而是“先写剪贴板，再模拟 `Alt+V`”。
- 所以目标输入框/编辑器本身要支持标准粘贴快捷键。
- Wayland 下使用 `ydotool`，它依赖 `ydotoold` 和 uinput；程序会在需要时自动尝试拉起 `ydotoold`，通常只会弹一次授权。
- 如果缺少对应工具，请先安装 `xdotool` 或 `ydotool`。
- 调试日志会写到项目根目录下的 `log/paste.log`。
- 默认会在写入剪贴板后等待约 `300ms` 再发送粘贴快捷键。

## 教程

1. 托盘部分使用 `QSystemTrayIcon + QMenu + QAction`。
2. 菜单里放了 5 句测试文案，中英混合，便于验证编码与输入行为。
3. 点击某一项后：
   - 先把该句写入 Qt 剪贴板。
   - X11 下调用 `xdotool key --clearmodifiers alt+v`。
   - Wayland 下调用 `ydotool key 56:1 47:1 47:0 56:0`。
   - 焦点窗口收到对应粘贴快捷键后，在当前光标位置插入文本。
4. 如果后面要支持更复杂的 Wayland 场景，通常还会涉及桌面 portal、输入法框架接口，或 KDE/系统级自动化能力；那会比这个 demo 更复杂。
