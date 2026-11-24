# Changelog

## 0.3.4 — 2026-11-20

- Keep terminal status, cursor and capability query responses in the host so hiding or restoring the view cannot lose their replies. Suppress duplicate replies from the renderer while retaining its color responses and focus events.
- Preserve both buffers' scrolling regions, current cursor, pending wrap and saved cursor state across snapshots. Continuing output after restoration keeps fixed headers and footers in place, including after leaving the alternate screen.
- Add query/reconnect and snapshot continuation regressions, plus a raw-mode PTY application that consumes clicks and wheel input across repeated view restoration.
- Restore untouched alternate-screen cells after widening, including after a narrow snapshot/reconnect. Erased cells stay erased, and split wide glyphs stay hidden until both columns fit.
- Preserve hidden columns when a leftward or fixed-count erase reaches the edge of a narrow alternate screen.
- Keep the webview's last requested dimensions independent of snapshot dimensions so delayed host messages cannot strand the PTY at an older width.

## 0.3.3 — 2026-11-20

- Fix TUI mouse clicks and scrolling stopping after the terminal view is hidden and restored. Snapshots now preserve SGR and SGR pixel mouse encoding together with mouse tracking, including when tracking is temporarily disabled.
- Forward legacy binary mouse reports to the PTY without UTF-8 re-encoding, preserving byte coordinates in wide terminals.
- Fix mixed CJK/ASCII text clipping at wrap boundaries and stale alternate-screen cells after narrowing the terminal.
- Add live/replayed click and wheel regressions for normal and alternate screens, tracking modes, legacy/SGR/pixel encoding, and wide grids.

## 0.3.2 — 2026-10-24

- Advertise OSC 8 support to pi with `PI_HYPERLINKS=1` in new shells, preserving explicit user overrides. This prevents pi from downgrading labels such as `#822` to plain `#822 (url)` text, whose hard-wrapped URL could be detected only partially.
- Test pi's installed Markdown renderer and capability detection through the production shell environment, a real PTY, and the browser; verify labels and both ends of a hard-wrapped URL retain the complete target before and after snapshot replay.
- After upgrading, start a new terminal and restart pi; existing processes keep their original environment.

## 0.3.1 — 2026-10-24

- Preserve OSC 8 text-link targets when terminal views are hidden and restored; add target hover and a native Open Link context action.
- Detect plain web URLs, including wrapped URLs, without treating terminal text as HTML.
- Enable Option-drag selection on macOS when agent CLIs capture the mouse; preserve normal CLI mouse input and Windows/Linux Shift-drag selection.

## 0.3.0 — Termdock

- Renamed to Termdock. Extension ID is now `yevin.termdock`; uninstall `yevin.termlet` and earlier builds before installing.
- View, command, context and setting IDs moved from `sidebarTerminal.*` to `termdock.*`. Old `sidebarTerminal.*` settings are no longer read; set them again under `termdock.*`.
- Shells now see `TERM_PROGRAM=termdock`.

## 0.2.2 — Security hardening and identity

- Paste now asks for confirmation when the clipboard contains control characters (such as Ctrl+O or ESC), not only line breaks.
- The Windows default shell resolves to the absolute System32 PowerShell path.
- Links in terminal output (OSC 8) open only for http/https URLs, after confirmation, via VS Code.
- Extension ID is now `yevin.termlet` (publisher `yevin`, name `termlet`). Uninstall earlier builds (`dot-local.independent-sidebar-terminal`) before installing; `sidebarTerminal.*` settings and commands are unchanged.
- Split the introduction into an English `README.md` (default) and a Chinese `README.zh-CN.md` that link to each other.
- Fixed VSIX packaging: `package.json` now declares the GitHub repository, so vsce can rewrite the README's relative links.
- Test build output is excluded from the VSIX.

## 0.2.1 — Introduction and identity

- Added an original terminal icon, with a packaged PNG and editable SVG.
- Set the author to yevin; preserved the publisher and extension ID for direct upgrades.
- Reworked the introduction into concise English and Chinese editions, with English first and offline in-page language links in Extension Details.
- Included a standalone Chinese README and a separate development/settings reference.
- No terminal UI or behavior changes.

## 0.2.0 — Termlet

- Renamed visible branding to Termlet; preserved extension, view, command and settings identifiers for in-place upgrades.
- Removed the inner toolbar and path/Local footer.
- Added native session switching with QuickPick and an active-session title description.
- Moved Clear, Restart, Copy, Paste and Settings into the native view overflow menu; kept native New/Close controls.
- Fixed duplicate shortcut paste by stopping handled clipboard events from reaching VS Code's second forwarding path.
- Preserved intentional repeated pastes; added clipboard, multiline-cancellation, stale-target and native-control regressions.

## 0.1.0

Initial direct-distribution build with a real bundled PTY, independent Secondary Side Bar view, multiple sessions, remote workspace routing, trust-gated startup and in-memory display restoration.
