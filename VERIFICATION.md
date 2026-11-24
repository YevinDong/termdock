# Build verification — Termdock 0.3.4

## Alternate-screen resize and snapshot fixes

- Added seven Node regressions for repeated shrink/widen and narrow reconnect, wrapped rows (including a wrapped top row after scrolling), wide graphemes and OSC 8 targets, line/display erasure, replacement of a split glyph, and alternate-buffer scrolling. A separate deterministic check passed 250 mixed-width snapshot/reconnect/widen round trips.
- Added six erase regressions for direction, fixed counts that reach or exceed the viewport edge, and selective erasure of a split wide glyph. Each checks both the live mirror and the restored renderer after widening.
- Chromium tests drive the real PTY through a delayed wide snapshot and narrow resize, then verify the renderer and PTY return to the fitted width. They also verify that untouched cropped Unicode cells return on widening.
- `npm run check` passed on Linux x64: strict typecheck, production build, 75 Node tests, and Chromium UI tests with a real PTY and `@earendil-works/pi-tui` 0.86.1. Linux, Windows and macOS browser platform values were exercised. VSIX packaging and archive integrity also passed.
- A native Windows x64 ConPTY smoke test verified PowerShell Unicode, matching console and host snapshot dimensions at 51×20 → 45×18 → 51×20, and the PowerShell exit code. This does not cover the Windows VS Code desktop UI or the standalone Node process's natural shutdown.

## 0.3.4 query/reconnect and scroll-region fixes — 2026-11-20

- Review reproduced lost cursor-query responses when reconnecting before mirror parsing or hiding between parsing and the output flush. It also reproduced a fixed footer being overwritten after snapshot replay because scrolling margins were reset.
- The host mirror now owns terminal status/cursor/capability responses. Renderer parser handlers suppress the matching requests, preserving keyboard/mouse input, theme color replies and focus reports. Cursor-blink configuration is synchronized with the mirror.
- Snapshots include both buffers' scrolling margins, cursor position, pending wrap and saved cursor state. Restoration occurs after snapshot parsing and before later live output; normal-buffer state also survives an alternate-screen session.
- Added 12 Node regressions covering five query delivery timings, split queries, both buffers with/without origin mode, pending wrap and saved cursor attributes. The real-PTY host check also verifies cursor and cursor-blink query responses without renderer replies.
- Browser coverage now includes a raw-mode PTY application that waits for cursor responses, consumes mouse clicks and wheel events, and keeps a clickable footer fixed while its body scrolls through three hide/restore cycles. Color replies, focus reports and suppression of duplicate cursor replies are checked separately.
- Validation passed on Linux x64: strict typecheck, production build, all 62 Node tests, and Chromium tests for simulated Linux/Windows/macOS platforms. The fixed query/reconnect and scroll-region cases are part of the normal test suite.
- Package: `termdock-0.3.4.vsix`. The previous 0.3.3 mouse fixes are included. No desktop VS Code session with Codex CLI/OpenCode or native Windows/macOS runtime verification is claimed.

## 0.3.3 TUI mouse replay fix — 2026-11-20

- Reproduced two defects before the fix: host snapshots dropped `?1006`/`?1016` while retaining mouse tracking, and live legacy mouse clicks emitted no host input because the webview only subscribed to `onData`. The browser still captured clicks and wheel events, making the TUI appear stuck.
- Snapshot serialization now preserves mouse encoding independently of tracking. Legacy reports use `onBinary` and a Latin-1 Buffer PTY write, preserving byte coordinates above 127.
- `npm run check` passed on Linux x64: strict typecheck, production build, all 50 Node tests, and Chromium UI tests with a real PTY and simulated Linux/Windows/macOS platform values.
- Snapshot tests cover X10/VT200/drag/any tracking, legacy/SGR/SGR pixel encoding, both buffers, and cutoffs while tracking is disabled. Browser tests check live and replayed clicks/wheel across VT200/drag/any, all three encodings and both buffers; wide-grid tests cover binary coordinates above 127 and SGR columns beyond the 223-column legacy limit. The mocked VS Code host test verifies `1b 5b 4d 20 80 e0` reaches a real PTY unchanged.
- Existing flow-control ACK/disconnect, clipboard, links, Unicode and resize regressions pass. The package also includes the prior CJK wrap-boundary correction.
- These checks reproduce the terminal protocol failure; no live Codex CLI/OpenCode session inside a desktop VS Code window or native Windows/macOS runtime was tested.
- Package: `termdock-0.3.3.vsix`. Install through VS Code's **Extensions: Install from VSIX...**, reload as prompted, and start a new terminal/TUI.

## 0.3.2 pi capability fix — 2026-10-24

- Reproduced the user-visible failure with installed `@earendil-works/pi-tui@1.0.4`, not a synthetic OSC 8 string: the production Termdock environment made pi report `hyperlinks: false`, yielding `#822 (url)` with a hard-wrapped fallback URL.
- New shells default `PI_HYPERLINKS` to `1` without overwriting explicit user values. `TERM_PROGRAM` remains `termdock`; no terminal identity spoofing or adjacent-line URL guessing is used.
- 47 Node tests plus typecheck/build and Chromium UI tests pass. With `PI_TUI_PATH` set, the actual pi Markdown renderer runs in a real PTY; `#822`, the first URL segment and its final character all hover/click with the complete `https://github.com/Qiyin-Tech/orchestra-backend/pull/822` target, live and after host snapshot replay.
- Linux-hosted tests simulate Linux/Windows/macOS `navigator.platform`; no live macOS VS Code/pi window verification is claimed. `test/termdock-pi-preview.png` captures the macOS-platform browser result.
- Build: `termdock-0.3.2.vsix`. Install, create a new terminal and restart pi; already running shells do not inherit the new environment. Existing 0.3.1 shells can use `PI_HYPERLINKS=1 pi` as a temporary workaround.


## 0.3.1 URL / mouse-selection fixes — 2026-10-24

- `npm run check` passed on Linux x64, Node.js 24.21.0: strict typecheck, production bundles, 46 Node tests, and Chromium UI tests with real PTYs.
- Reproduced the upstream serializer defect: an OSC 8 `URL` label serialized as underlined text without its URI. The guarded build-time fix preserves per-cell targets in normal/alternate buffers, Unicode/wrapped/scrollback labels and an open link continued by later live output.
- Browser tests cover piAgent-style labels through a real PTY and host hide/reconnect/snapshot, target hover, click dispatch, native-context-menu arguments, wrapped plain URLs, drag-without-opening, and selection/copy while mouse reporting is enabled.
- Browser tests override `navigator.platform` for Linux, Windows and macOS. Normal CLI mouse reports remain enabled; Shift-drag (Windows/Linux) and Option-drag (macOS) select without sending the gesture to the CLI.
- These are Linux-hosted browser tests, not a live macOS piAgent/VS Code test. Actual VS Code native menu rendering and macOS clipboard integration still need desktop verification.
- Build: `termdock-0.3.1.vsix`. Manifest, lockfile, shell `TERM_PROGRAM_VERSION`, changelog and package output name are synchronized to 0.3.1. No Marketplace publication or installation on a user machine was performed.

## Original 0.3.0 release verification

Date: 2026-10-16. Build/test host: Linux x86_64, Node.js 24.19.0.

## Passed

- Strict TypeScript typecheck and production extension/webview bundling.
- 45 automated tests, including:
  - 19 clipboard regressions: original double-paste forwarding path, Mac/Windows/Linux shortcuts, native/context paste, unrelated keys and intentional repeated identical pastes.
  - Mocked VS Code API with real PTY: native session title/QuickPick/command contexts, cancellation, hidden replay, exit/close, multiline-paste cancel/accept and clipboard reads spanning session changes/closure.
  - Three documentation/branding checks: author, PNG dimensions, editable SVG, English-first language anchors and Chinese/source consistency.
  - Manifest regression: `termdock.*` view/command/settings keys, Termdock branding and native navigation/overflow actions.
  - Real Linux x64 PTY: TTY detection, input/output, resize, Unicode and exit status.
  - ANSI replay boundaries, incomplete control sequences, overflow limits, output acknowledgements, reconnect races and shell cleanup.
- All six native binary targets, Windows helper resources and macOS executable modes inspected.
- Official `@vscode/vsce` packaging; manifest, both README editions, icon PNG/SVG, licenses and bundled-runtime identity checked.
- Offline language anchors verified against VS Code 1.106.0 sanitizer/Markdown/webview source and the packaged anchor targets. Extension Details does not open separate relative Markdown files; Chinese is a second section with reciprocal in-page navigation.
- Final extracted VSIX loaded its native Linux x64 backend and launched a real TTY shell.

## Not run / limits

- New layout and paste fix inside an actual macOS VS Code window.
- Windows/macOS/ARM64 runtime execution in this build environment.
- End-to-end Remote SSH or Dev Container testing.
- Chromium UI harness: the build sandbox prevents Chromium startup due to local process/socket restrictions. The updated harness is included; no live GUI pass is claimed.

The original double-paste path is reproduced by source-level tests simulating VS Code's webview keydown forwarding. These tests establish the event-routing correction but do not replace live desktop verification.

## Release notes

- Direct VSIX distribution; no Marketplace publication or user-computer installation performed.
- Author is yevin and the extension icon is an original 256px PNG, with SVG source included.
- Display name is Termdock. Extension ID is `yevin.termdock` and the version is 0.3.0. View, command and setting IDs use `termdock.*`.
- Requires VS Code >=1.106.0 and a Node.js extension host.
- Bundled native targets: macOS ARM64/x64, glibc Linux ARM64/x64, Windows ARM64/x64.
- Linux requires glibc 2.28+; Alpine/musl is unsupported.
- Active sessions do not survive extension/window reload. Detached processes remain outside attached-shell cleanup guarantees.
