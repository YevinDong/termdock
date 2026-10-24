# Developing Termdock

## Build

Use Node.js 20 or later (22/24 recommended):

```sh
npm ci --ignore-scripts
npm run typecheck
npm run build
npm test
npm run package
```

The lockfile pins dependencies. Installation scripts are disabled; the build copies published native binaries and preserves macOS helper execution permissions. No Python, npm or compiler is needed on the machine installing the VSIX.

The icon's editable source is `media/icon.svg`; the extension uses `media/icon.png` (256 × 256 RGBA). To regenerate it with Inkscape:

```sh
inkscape media/icon.svg --export-type=png --export-filename=media/icon.png --export-width=256 --export-height=256
```

## Documentation

`README.md` is the English extension introduction and the default README. `README.zh-CN.md` is the Chinese edition. Each links to the other with a relative file link. `package.json` sets `repository`, so vsce rewrites those links to GitHub URLs when packaging; without `repository`, `vsce package` fails on relative links.

## Settings reference

All settings use the `termdock.*` namespace.

| Setting | Default | Behavior |
| --- | --- | --- |
| `shell` | Empty | `$SHELL` or `/bin/sh` on macOS/Linux; `powershell.exe` on Windows |
| `shellArgs` | `null` | `-l` on macOS, no arguments elsewhere; `[]` disables defaults |
| `cwd` | Empty | Active editor's workspace folder, then first workspace folder, then home |
| `fontFamily` | Empty | Inherits integrated terminal/editor font |
| `fontSize` | `0` | Inherits integrated terminal font size; effective range 6–72 |
| `scrollback` | `2000` | 100–10000 lines per new terminal |
| `cursorBlink` | `true` | Cursor blink |

`cwd` accepts `${workspaceFolder}`, `${userHome}`, `~/…` and relative paths. Relative paths resolve from the workspace folder or home. Invalid directories produce an error instead of starting elsewhere. Shell/directory/argument changes apply to new shells. Paths always refer to the machine running the workspace extension host.

## Tests and boundaries

See `VERIFICATION.md` for the release's actual checks and untested platforms. A browser harness is also included:

```sh
CHROMIUM_PATH=/path/to/chromium npm run test:ui
```

To exercise the actual pi renderer and capability detection, point `PI_TUI_PATH` at an installed `@earendil-works/pi-tui` package directory (no extra project dependency):

```sh
PI_TUI_PATH=/path/to/@earendil-works/pi-tui CHROMIUM_PATH=/path/to/chromium npm run check
```

`test/pi-output.mjs` renders the reported Chinese PR label `#822` and a hard-wrapped URL. The browser harness runs it through a real PTY with the production `shellEnvironment`, checks the complete target at the label and both ends of the URL, and repeats after snapshot replay. Without `PI_TUI_PATH`, only the pi-specific renderer check is omitted; the environment regression always runs in `npm test`.

It intercepts test assets and uses an in-process PTY bridge, without a listening web server. It does not emulate a complete VS Code window. Clipboard unit regressions separately simulate VS Code's keydown forwarding, including intentional repeated pastes and multiline cancellation.

`scripts/serialize-links.mjs` applies a guarded build-time fix to Serialize Addon 0.13.0: preserve OSC 8 targets and the active link across snapshots. It uses pinned xterm internals; source changes fail the build rather than silently dropping the fix. Remove it when the upstream serializer supports OSC 8. `test/session.test.cjs` checks per-cell targets, wrapping, Unicode, alternate buffers and live continuation; the browser harness checks replayed labels and platform-specific forced selection.

The backend is bundled; it does not load private VS Code native modules. It uses Microsoft node-pty 1.2.0-beta.15, xterm.js/headless 5.5.0, Fit Addon 0.10.0 and Serialize Addon 0.13.0. The PTY beta supplies Node-API prebuilds for the six supported platform/architecture pairs. Third-party licenses are in `THIRD_PARTY_NOTICES.txt`.

## Lifecycle and security

- Startup requires an explicit action and a trusted workspace. Shells run with the extension host's OS permissions.
- A hidden view keeps its sessions alive. Display buffers remain in memory; they are not saved to logs or storage. A shell may still save its normal history.
- Closing/restarting terminates the attached shell after confirmation. Deliberately detached processes are outside this cleanup guarantee. Use separately managed tmux/screen for process persistence beyond a window reload.
- No telemetry, external web assets, HTTP server or network listener is added. Programs run in the terminal may use the network normally.
- Webview scripts use nonce-based CSP; terminal output is never inserted as HTML and workspace files are not exposed.
- Output acknowledgements and bounded scrollback control buffering. Unfinished control sequences over 128 KiB are cancelled, suppressing the remainder until a sequence boundary.
- Browser-only VS Code without a Node.js extension host and virtual filesystems are unsupported. Existing native terminals cannot be imported into Termdock.
