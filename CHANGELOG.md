# Changelog

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
