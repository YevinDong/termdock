<a id="readme-en"></a>

# Termlet · English

**Your terminal, close at hand.**  
A lightweight, independent terminal built for VS Code’s Secondary Side Bar.

**English** · [简体中文 ↓](#readme-zh-cn)

Keep your code, the bottom terminal panel, and another set of shells visible at the same time. Use a real terminal in a clean, compact space.

## Key Features

- **Real shells.** Powered by a PTY, with input and output, colored text, Unicode, and automatic resizing.
- **Up to eight sessions.** Switch between shells with VS Code’s native picker. The title bar shows the current session.
- **Clean, native controls.** Create, switch, and close sessions from the title bar. Clear, restart, copy, paste, and settings are tucked into the **…** menu.
- **A familiar look.** Follows your VS Code theme and terminal font. Customize the shell, starting directory, and scrollback limit.
- **Remote workspace support.** Install the extension on the remote host in Remote SSH or Dev Containers to run shells on the machine hosting your workspace.

## Quick Start

If the view is not visible, enable **View → Appearance → Secondary Side Bar**. Drag the view or use **Move View** to reposition it. Install a newer version directly over the existing one; no uninstall is needed.

## Everyday Use

Click **Switch Terminal** to select a shell, **+** to create one, or the **trash** icon to close it. Search for **Termlet** in Settings to customize it. Existing `sidebarTerminal.*` settings remain supported.

Copy and paste: use **⌘C / ⌘V** on macOS, or **Ctrl+Shift+C / Ctrl+Shift+V** on Windows and Linux. **Ctrl+C** interrupts the running program. Pasting multiple lines requires confirmation.

## Before You Use It

- Requires **VS Code 1.106+**. **ARM64 / x64** backends are bundled for macOS, Windows, and glibc Linux. Linux requires glibc 2.28+; Alpine/musl is not supported. Windows requires Windows 10 version 1809 or later, or Windows 11.
- Hiding the view keeps sessions running. Reloading or closing VS Code ends them, so save your terminal work first. Native terminal task integration, split terminals, shell integration, and session restoration across reloads are not included.
- Shells start only when you explicitly launch them in a trusted workspace. No telemetry is collected, and no new network services are started.
- Linux x64 PTY behavior and automated regression tests have been verified. The macOS/Windows VS Code UI and complete remote workflows have not yet been tested.
---

<a id="readme-zh-cn"></a>

# Termlet · 简体中文

**终端，就在手边。**  
为 VS Code 辅助侧边栏打造的轻巧独立终端。作者：**yevin**。

[English ↑](#readme-en) · **简体中文**

让代码、底部终端面板和另一组 Shell 同时保持可见。在简洁的小空间里，使用真正的终端。

## 核心功能

- **真正的 Shell。** 基于 PTY，支持输入输出、彩色文本、Unicode 和自动调整尺寸。
- **最多八个会话。** 用 VS Code 原生选择器切换 Shell，标题栏显示当前会话。
- **简洁的原生操作。** 标题栏可新建、切换和关闭；清屏、重启、复制、粘贴与设置收纳在 **…** 中。
- **熟悉的外观。** 跟随 VS Code 主题和终端字体，可自定义 Shell、启动目录与回滚行数。
- **适配远程工作区。** 在 Remote SSH 或 Dev Containers 中安装到远程端后，Shell 在工作区所在机器运行。

## 快速开始

1. 在扩展页打开 **… → 从 VSIX 安装…**，选择 `termlet-0.2.1.vsix`。
2. 在命令面板运行 **Termlet: Focus**。
3. 在受信任的工作区中点击 **+**，启动 Shell。

若看不到视图，请启用 **视图 → 外观 → 辅助侧边栏**。可以拖动视图，或使用 **移动视图** 调整位置。已有版本可直接覆盖升级，无需先卸载。

## 日常使用

点击 **会话切换** 选择 Shell，点击 **+** 新建，点击 **垃圾桶** 关闭。在设置中搜索 **Termlet** 即可自定义；原有 `sidebarTerminal.*` 配置继续有效。

复制粘贴：macOS 使用 **⌘C / ⌘V**；Windows 和 Linux 使用 **Ctrl+Shift+C / Ctrl+Shift+V**。**Ctrl+C** 中断程序。粘贴多行内容前会询问确认。

## 使用须知

- 需要 **VS Code 1.106+**。已打包 macOS、Windows 与 glibc Linux 的 **ARM64 / x64** 后端。Linux 需要 glibc 2.28+，不支持 Alpine/musl；Windows 需要 Windows 10 1809+ 或 Windows 11。
- 隐藏视图不会结束会话；重载或关闭 VS Code 会结束会话，请先保存终端中的工作。不包含原生终端的任务集成、拆分、Shell 集成和跨重载会话恢复。
- 仅在受信任的工作区中由你主动启动 Shell。不收集遥测，也不新增网络服务。
- 已验证 Linux x64 PTY 和自动化回归测试；尚未实测 macOS/Windows 的 VS Code 界面及完整远程流程。

**MIT 许可 · 作者：yevin**  
通过 VSIX 直接分发。为保持覆盖升级兼容，打包发布者保留为 `dot-local`，扩展 ID 保留为 `dot-local.independent-sidebar-terminal`；这不是已验证的 Marketplace 发布者。
