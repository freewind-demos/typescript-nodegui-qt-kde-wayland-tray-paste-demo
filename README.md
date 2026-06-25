# typescript-nodegui-qt-kde-tray-paste-demo

## 简介

这是一个给 Linux KDE 环境准备的最小托盘粘贴 demo。

它用 `NodeGui + TypeScript + Qt` 创建系统托盘图标，点击菜单里的某一句预置文本后，会把这句话粘贴到当前有焦点窗口的光标位置。

当前实现优先服务“验证粘贴是否通”这个目标，所以先限定在 `KDE + X11`，粘贴动作走 `clipboard + xdotool + Ctrl+V`。

## 快速开始

### 环境要求

- Linux
- KDE Plasma
- X11 会话
- Node.js
- `pnpm`
- `xdotool`
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

- 这个 demo 不是“直接向别的进程注入文本”，而是“先写剪贴板，再模拟 `Ctrl+V`”。
- 所以目标输入框/编辑器本身要支持标准粘贴快捷键。
- 当前不支持 Wayland；很多 Wayland 会话默认不允许 `xdotool` 这类 X11 自动化方案控制焦点窗口。
- 如果缺少 `xdotool`，可先安装：

```bash
sudo apt install xdotool
```

## 教程

1. 托盘部分使用 `QSystemTrayIcon + QMenu + QAction`。
2. 菜单里放了 5 句测试文案，中英混合，便于验证编码与输入行为。
3. 点击某一项后：
   - 先把该句写入 Qt 剪贴板。
   - 再调用 `xdotool key --clearmodifiers ctrl+v`。
   - 焦点窗口收到标准粘贴快捷键后，在当前光标位置插入文本。
4. 如果后面要支持 Wayland，通常得改成桌面 portal、输入法框架接口，或 KDE/系统级自动化能力；那会明显比这个 demo 复杂。
