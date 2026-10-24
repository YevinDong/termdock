# Termdock · 简体中文

**终端，就在手边。**  
为 VS Code 辅助侧边栏打造的轻巧独立终端。

[English](README.md) · **简体中文**

让代码、底部终端面板和另一组 Shell 同时保持可见。在简洁的小空间里，使用真正的终端。

## 核心功能

- **真正的 Shell。** 基于 PTY，支持输入输出、彩色文本、Unicode 和自动调整尺寸。
- **最多八个会话。** 用 VS Code 原生选择器切换 Shell，标题栏显示当前会话。
- **简洁的原生操作。** 标题栏可新建、切换和关闭；清屏、重启、复制、粘贴与设置收纳在 **…** 中。
- **熟悉的外观。** 跟随 VS Code 主题和终端字体，可自定义 Shell、启动目录与回滚行数。
- **适配远程工作区。** 在 Remote SSH 或 Dev Containers 中安装到远程端后，Shell 在工作区所在机器运行。

## 快速开始

若看不到视图，请启用 **视图 → 外观 → 辅助侧边栏**。可以拖动视图，或使用 **移动视图** 调整位置。新版本可直接覆盖安装。

## 日常使用

点击 **会话切换** 选择 Shell，点击 **+** 新建，点击 **垃圾桶** 关闭。在设置中搜索 **Termdock** 即可自定义。

复制粘贴：macOS 使用 **⌘C / ⌘V**；Windows 和 Linux 使用 **Ctrl+Shift+C / Ctrl+Shift+V**。**Ctrl+C** 中断程序。粘贴多行内容前会询问确认。

终端输出中的网址及 OSC 8 文字超链接支持点击，隐藏再恢复视图后仍保留链接。悬停可查看目标地址，也可右键选择 **Termdock: Open Link**；仅支持 HTTP(S) 地址，打开前会确认。

新建 Shell 默认设置 `PI_HYPERLINKS=1`，让 pi 的 `#822` 等文字标签保持真正的超链接，不再降级成 `文字 (网址)`。保留已有环境变量覆盖；pi 显式设置的 `terminal.hyperlinks` 仍优先。升级后请新建终端并重启 pi，已有进程不会获得新环境变量。

若 Agent CLI 接管鼠标，macOS 按住 **Option** 拖动选区，Windows/Linux 按住 **Shift** 拖动，再使用上述快捷键复制。不按修饰键时，鼠标仍交给 CLI 处理。

## 使用须知

- 需要 **VS Code 1.106+**。已打包 macOS、Windows 与 glibc Linux 的 **ARM64 / x64** 后端。Linux 需要 glibc 2.28+，不支持 Alpine/musl；Windows 需要 Windows 10 1809+ 或 Windows 11。
- 隐藏视图不会结束会话；重载或关闭 VS Code 会结束会话，请先保存终端中的工作。不包含原生终端的任务集成、拆分、Shell 集成和跨重载会话恢复。
- 仅在受信任的工作区中由你主动启动 Shell。不收集遥测，也不新增网络服务。
- 已验证 Linux x64 PTY 和自动化回归测试；尚未实测 macOS/Windows 的 VS Code 界面及完整远程流程。
