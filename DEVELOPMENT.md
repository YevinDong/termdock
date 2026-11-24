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

`scripts/serialize-links.mjs` applies guarded build-time fixes to Serialize Addon 0.14.0 to preserve OSC 8 targets, the active link, and SGR/SGR pixel mouse encoding across snapshots. Mouse tracking and encoding are independent modes; a reset followed by tracking alone would switch a TUI to legacy binary reports. Remove the patches as the upstream serializer supports these states. `test/session.test.cjs` checks per-cell targets, wrapping, Unicode, alternate buffers, live continuation, and mouse encoding even while tracking is temporarily disabled.

The alternate screen stores cropped cells separately from xterm's visible lines. `src/alternate.ts` uses xterm 6.0 buffer internals to keep cells attached to their rows and hide wide glyphs split by the viewport edge. It tracks erase commands by direction: erasing to the end of a line or an entire row invalidates its hidden cells; a bounded erase does not invalidate unrelated hidden cells. The serializer replays visible alternate-screen rows using explicit line breaks; the snapshot restores soft-wrap flags and hidden cells as metadata before later output. The webview tracks its last fit request separately from the dimensions used to replay the snapshot.

The webview forwards both `onData` (text/SGR) and `onBinary` (legacy mouse reports). The host writes binary strings as Latin-1 bytes to avoid expanding coordinates above 127 into UTF-8. The real-PTY host test checks these bytes, and the browser harness checks live/replayed clicks and wheel events across three tracking modes, three encodings, both buffers, and wide-grid coordinates. Windows/macOS platform values are simulated in Linux Chromium; this does not replace desktop testing on those hosts.

The headless mirror answers terminal status, cursor, device attribute, mode and DECRQSS queries independently of view connectivity. `webview/queries.ts` consumes these requests in the renderer to prevent duplicate responses, without filtering user input by its contents. Color responses and focus events remain in the renderer. Host and renderer cursor-blink settings are synchronized so mode queries reflect the configured terminal.

`src/snapshot.ts` captures scrolling margins, current cursor coordinates (including pending wrap), and saved cursor coordinates/attributes for both buffers at the snapshot cutoff. The renderer restores this metadata in the snapshot write callback before processing subsequent output. This uses the pinned xterm 6.0 buffer internals: emitting DECSTBM after serialized text would reset the cursor, and cursor movement sequences would lose pending wrap. Saved cursor rows are relative to each buffer's scrollback base. Review the helper when upgrading xterm.

`test/snapshot.test.cjs` covers query timing around reconnects, query fragments spanning snapshots, regional scrolling with origin mode, pending wrap and returning from the alternate screen. `test/tui-recovery.cjs` is a raw-mode PTY fixture used by the browser harness: it waits for cursor responses and updates a fixed footer and scrolling body in response to actual mouse input over three hide/restore cycles per simulated platform.

The webview and headless mirror both use xterm 6.0.0 and `15-graphemes`. `scripts/unicode-graphemes.mjs` backports the upstream fix for Unicode Graphemes Addon 0.4.0 to read a Node.js Buffer at its actual byte offset. Both emulators apply resizes in output order. The shared resize helper trims stale cells outside the new alternate-screen grid and clears wide characters split at the right edge. The browser harness checks the fitted grid, alternate-screen narrowing, grapheme wrapping, and replayed links.

The xterm container sets `text-spacing-trim: space-all` so Chromium uses full punctuation spacing for both the renderer's repeated-glyph measurements and the actual terminal rows. The browser harness checks that mixed CJK and ASCII rows fit their cell grid through the last character.

The bundled backend uses Microsoft node-pty 1.2.0-beta.15. The PTY beta supplies Node-API prebuilds for the six supported platform/architecture pairs. Third-party licenses are in `THIRD_PARTY_NOTICES.txt`.

## Lifecycle and security

- Startup requires an explicit action and a trusted workspace. Shells run with the extension host's OS permissions.
- A hidden view keeps its sessions alive. Display buffers remain in memory; they are not saved to logs or storage. A shell may still save its normal history.
- Closing/restarting terminates the attached shell after confirmation. Deliberately detached processes are outside this cleanup guarantee. Use separately managed tmux/screen for process persistence beyond a window reload.
- No telemetry, external web assets, HTTP server or network listener is added. Programs run in the terminal may use the network normally.
- Webview scripts use nonce-based CSP; terminal output is never inserted as HTML and workspace files are not exposed.
- Output acknowledgements and bounded scrollback control buffering. Unfinished control sequences over 128 KiB are cancelled, suppressing the remainder until a sequence boundary.
- Browser-only VS Code without a Node.js extension host and virtual filesystems are unsupported. Existing native terminals cannot be imported into Termdock.
