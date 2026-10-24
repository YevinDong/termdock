import * as path from 'node:path';
export function dimension(value: unknown, fallback: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(2, Math.min(max, Math.floor(value))) : fallback;
}
export function resolveCwd(configured: string, workspace: string | undefined, home: string): string {
  const expanded = configured.replaceAll('${workspaceFolder}', workspace || home).replaceAll('${userHome}', home);
  if (!expanded) return workspace || home;
  if (expanded === '~') return home;
  if (expanded.startsWith('~/')) return path.join(home, expanded.slice(2));
  return path.isAbsolute(expanded) ? expanded : path.resolve(workspace || home, expanded);
}
export function shellConfig(platform: string, shell: string, args: string[] | null, env: NodeJS.ProcessEnv) {
  // Resolve the Windows default absolutely so a same-named file elsewhere on the search path cannot be launched.
  const executable = shell || (platform === 'win32' ? path.win32.join(env.SystemRoot || env.windir || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : env.SHELL || '/bin/sh');
  return { executable, args: args ?? (platform === 'darwin' ? ['-l'] : []) };
}
export function shellEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && (!key.startsWith('VSCODE_') || ['VSCODE_IPC_HOOK_CLI', 'VSCODE_CLI_REQUIRE_TOKEN'].includes(key)) && key !== 'ELECTRON_RUN_AS_NODE' && key !== 'NODE_OPTIONS' && key !== 'NODE_REPL_EXTERNAL_MODULE') result[key] = value;
  }
  result.TERM = 'xterm-256color';
  result.COLORTERM = 'truecolor';
  result.TERM_PROGRAM = 'termdock';
  result.TERM_PROGRAM_VERSION = '0.3.2';
  // pi treats unknown TERM_PROGRAM names as hyperlink-incapable; xterm supports OSC 8.
  result.PI_HYPERLINKS ??= '1';
  return result;
}
/** Line breaks or other control characters (e.g. Ctrl+O, ESC) in pasted text can run commands or leave bracketed paste. */
export function pasteRisk(text: string): 'multiline' | 'control' | undefined {
  if (/[\r\n]/.test(text)) return 'multiline';
  if (/[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(text)) return 'control';
  return undefined;
}
/** Only HTTP(S) links from terminal output may be opened. */
export function isWebLink(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 8192) return false;
  try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:'; } catch { return false; }
}
