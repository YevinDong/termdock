# Termdock

**Your terminal, close at hand.**  
A lightweight, independent terminal built for VS Code’s Secondary Side Bar.

**English** · [简体中文](README.zh-CN.md)

Keep your code, the bottom terminal panel, and another set of shells visible at the same time. Use a real terminal in a clean, compact space.

## Key Features

- **Real shells.** Powered by a PTY, with input and output, colored text, Unicode, and automatic resizing.
- **Up to eight sessions.** Switch between shells with VS Code’s native picker. The title bar shows the current session.
- **Clean, native controls.** Create, switch, and close sessions from the title bar. Clear, restart, copy, paste, and settings are tucked into the **…** menu.
- **A familiar look.** Follows your VS Code theme and terminal font. Customize the shell, starting directory, and scrollback limit.
- **Remote workspace support.** Install the extension on the remote host in Remote SSH or Dev Containers to run shells on the machine hosting your workspace.

## Quick Start

If the view is not visible, enable **View → Appearance → Secondary Side Bar**. Drag the view or use **Move View** to reposition it. Newer versions install directly over an existing one.

## Everyday Use

Click **Switch Terminal** to select a shell, **+** to create one, or the **trash** icon to close it. Search for **Termdock** in Settings to customize it.

Copy and paste: use **⌘C / ⌘V** on macOS, or **Ctrl+Shift+C / Ctrl+Shift+V** on Windows and Linux. **Ctrl+C** interrupts the running program. Pasting multiple lines requires confirmation.

Web URLs and OSC 8 text links in terminal output are clickable, including after hiding/restoring the view. Hover to see the target; right-click for **Termdock: Open Link**. Only HTTP(S) targets are opened, after confirmation.

For pi, new shells default to `PI_HYPERLINKS=1` so text labels remain real hyperlinks instead of `label (url)` fallbacks. Existing environment overrides are preserved; pi's explicit `terminal.hyperlinks` setting still takes precedence. After upgrading, create a new terminal and restart pi: existing processes do not receive new environment variables.

If an agent CLI captures the mouse, hold **Option** on macOS or **Shift** on Windows/Linux while dragging to select text, then use the copy shortcut above. Unmodified mouse input still goes to the CLI.

## Before You Use It

- Requires **VS Code 1.106+**. **ARM64 / x64** backends are bundled for macOS, Windows, and glibc Linux. Linux requires glibc 2.28+; Alpine/musl is not supported. Windows requires Windows 10 version 1809 or later, or Windows 11.
- Hiding the view keeps sessions running. Reloading or closing VS Code ends them, so save your terminal work first. Native terminal task integration, split terminals, shell integration, and session restoration across reloads are not included.
- Shells start only when you explicitly launch them in a trusted workspace. No telemetry is collected, and no new network services are started.
- Linux x64 PTY behavior and automated regression tests have been verified. The macOS/Windows VS Code UI and complete remote workflows have not yet been tested.
