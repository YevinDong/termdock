# Build verification — Termdock 0.3.1

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
