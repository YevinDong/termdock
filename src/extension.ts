import * as vscode from 'vscode';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { accessSync, constants, statSync, chmodSync } from 'node:fs';
import type * as Pty from 'node-pty';
import { Session } from './session';
import { dimension, isWebLink, pasteRisk, resolveCwd, shellConfig, shellEnvironment } from './core';

class Termlet implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private sessions = new Map<string, Session>();
  private active?: string;
  private ptyModule?: typeof Pty;
  private starting = false;
  private number = 0;
  private ready = false;
  private cols = 80;
  private rows = 24;
  private disposables: vscode.Disposable[] = [];
  constructor(private context: vscode.ExtensionContext) {
    this.disposables.push(vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('sidebarTerminal') || e.affectsConfiguration('terminal.integrated') || e.affectsConfiguration('editor.fontFamily')) this.send({type:'settings', settings:this.settings()});
    }), vscode.workspace.onDidGrantWorkspaceTrust(() => this.state()));
    this.state();
  }
  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view; this.ready = false; view.title = 'Termlet'; this.state();
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist'), vscode.Uri.joinPath(this.context.extensionUri, 'media')] };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((message: unknown) => { void this.onMessage(message).catch(e => this.error(e)); }, undefined, this.context.subscriptions);
    view.onDidDispose(() => { if (this.view === view) { this.view = undefined; this.ready = false; for (const s of this.sessions.values()) s.setConnected(false); } }, undefined, this.context.subscriptions);
    view.onDidChangeVisibility(() => { for(const s of this.sessions.values()) s.setConnected(view.visible && this.ready); if (view.visible && this.ready) {this.state();for(const s of this.sessions.values()) s.snapshot();this.send({type:'visible'});} }, undefined, this.context.subscriptions);
  }
  async focus() { await vscode.commands.executeCommand('sidebarTerminal.terminal.focus'); this.view?.show(false); this.send({type:'focus'}); }
  private send(message: unknown) { if (this.ready && this.view) void this.view.webview.postMessage(message); }
  private state() {
    const current = this.active ? this.sessions.get(this.active) : undefined;
    if (this.view) this.view.description = current ? `${current.name}${current.running ? '' : ` · exited (${current.exitCode ?? 0})`}` : undefined;
    void vscode.commands.executeCommand('setContext', 'sidebarTerminal.hasSessions', this.sessions.size > 0);
    void vscode.commands.executeCommand('setContext', 'sidebarTerminal.activeRunning', !!current?.running && vscode.workspace.isTrusted);
    void vscode.commands.executeCommand('setContext', 'sidebarTerminal.canCreate', this.sessions.size < 8);
    this.send({type:'state', sessions:[...this.sessions.values()].map(s=>s.info()), active:this.active, trusted:vscode.workspace.isTrusted, host:vscode.env.remoteName || 'local', settings:this.settings()});
  }
  private settings() {
    const c = vscode.workspace.getConfiguration('sidebarTerminal');
    const t = vscode.workspace.getConfiguration('terminal.integrated');
    return {
      fontFamily: c.get<string>('fontFamily') || t.get<string>('fontFamily') || vscode.workspace.getConfiguration('editor').get<string>('fontFamily') || 'monospace',
      fontSize: Math.max(6, Math.min(72, c.get<number>('fontSize') || t.get<number>('fontSize') || 14)),
      cursorBlink: c.get<boolean>('cursorBlink', true),
      scrollback: c.get<number>('scrollback', 2000)
    };
  }
  private nativeModule() {
    if (this.ptyModule) return this.ptyModule;
    const supported = ['darwin-arm64','darwin-x64','linux-arm64','linux-x64','win32-arm64','win32-x64'];
    const target = `${process.platform}-${process.arch}`;
    if (!supported.includes(target)) throw new Error(`Unsupported host ${target}. Supported: ${supported.join(', ')}.`);
    // VSIX archives can lose executable bits on extraction. Repair only our own shipped helper.
    if (process.platform === 'darwin') {
      const helper = path.join(this.context.extensionPath, 'dist', 'vendor', 'pty', 'prebuilds', target, 'spawn-helper');
      try { accessSync(helper, constants.X_OK); } catch { chmodSync(helper, 0o755); }
    }
    try { this.ptyModule = require('./vendor/pty') as typeof Pty; }
    catch (e) { throw new Error(`Could not load the bundled PTY for ${target}: ${String(e)}. Linux requires glibc (Alpine/musl is not supported).`); }
    return this.ptyModule;
  }
  async create() {
    if (this.starting) return;
    this.starting = true;
    try {
      if (!vscode.workspace.isTrusted) { this.state(); void vscode.window.showWarningMessage('Trust this workspace before starting a terminal in Termlet.'); return; }
      if (this.sessions.size >= 8) throw new Error('Close a terminal first. Up to 8 terminals can be open.');
      const c = vscode.workspace.getConfiguration('sidebarTerminal');
      const folder = vscode.window.activeTextEditor && vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri) || vscode.workspace.workspaceFolders?.[0];
      const cwd = resolveCwd(c.get<string>('cwd', ''), folder?.uri.fsPath, os.homedir());
      if (!statSync(cwd).isDirectory()) throw new Error(`Starting directory is not a folder: ${cwd}`);
      const {executable, args} = shellConfig(process.platform, c.get<string>('shell', ''), c.get<string[] | null>('shellArgs', null), process.env);
      const pty = this.nativeModule().spawn(executable, args, {name:'xterm-256color', cols:this.cols, rows:this.rows, cwd, env:shellEnvironment(process.env)});
      const id = randomUUID();
      const session = new Session(id, `${path.basename(executable)} ${++this.number}`, cwd, pty, this.settings().scrollback, m=>this.send(m), ()=>this.state());
      this.sessions.set(id, session); this.active = id;
      this.state(); session.setConnected(this.ready && !!this.view?.visible); if(this.ready && this.view?.visible) session.snapshot();
    } finally { this.starting = false; }
  }
  async newTerminal() { await this.focus(); await this.create(); }
  async switchTerminal() {
    if (!this.sessions.size) return;
    const items = [...this.sessions.values()].map(s => ({
      label: s.name, description: [s.id === this.active ? 'Active' : '', s.running ? '' : `Exited (${s.exitCode ?? 0})`].filter(Boolean).join(' · '),
      detail: `${vscode.env.remoteName ? `Remote · ${vscode.env.remoteName} · ` : ''}${s.cwd}`, id: s.id
    }));
    const selected = await vscode.window.showQuickPick(items, { title: 'Termlet: Switch Terminal', placeHolder: 'Choose a terminal', matchOnDescription: true, matchOnDetail: true });
    if (!selected || !this.sessions.has(selected.id)) return;
    this.active = selected.id; this.state(); await this.focus();
  }
  async copy() { await this.focus(); this.send({type:'copy'}); }
  async paste(id = this.active) {
    const s = id ? this.sessions.get(id) : undefined;
    if (!s || !s.running || !vscode.workspace.isTrusted) return;
    const text = await vscode.env.clipboard.readText();
    if (text.length > 1024 * 1024) throw new Error('Clipboard text is too large (maximum 1 MB).');
    const risk = pasteRisk(text);
    if (risk) {
      const answer = await vscode.window.showWarningMessage(risk === 'multiline' ? 'Paste multiple lines into the terminal? Pasted text can execute commands.' : 'Paste text containing control characters into the terminal? Pasted text can execute commands.', {modal:true}, 'Paste');
      if (answer !== 'Paste') return;
    }
    // The user may close or replace the target while a clipboard read/confirmation is pending.
    if (!s.running || this.sessions.get(s.id) !== s || !vscode.workspace.isTrusted) return;
    this.send({type:'paste', id:s.id, text});
  }
  async pasteFromCommand() { await this.focus(); await this.paste(); }
  settingsCommand() { return vscode.commands.executeCommand('workbench.action.openSettings', 'sidebarTerminal'); }
  async close(id = this.active, confirm = true) {
    const s = id && this.sessions.get(id); if (!s) return;
    if (confirm && s.running) {
      const result = await vscode.window.showWarningMessage(`Close ${s.name}? Its shell will stop and active programs may be interrupted.`, {modal:true}, 'Close Terminal');
      if (result !== 'Close Terminal') return;
    }
    s.dispose(); this.sessions.delete(s.id);
    if (this.active === s.id) this.active = this.sessions.keys().next().value;
    this.state();
  }
  async restart() {
    const id = this.active; const s = id ? this.sessions.get(id) : undefined;
    if (s?.running) {
      const result = await vscode.window.showWarningMessage(`Restart ${s.name}? Its shell will stop and active programs may be interrupted.`, {modal:true}, 'Restart');
      if (result !== 'Restart') return;
    }
    if (id) await this.close(id, false);
    await this.create();
  }
  clear() { if (this.active) this.sessions.get(this.active)?.clear(); }
  private async onMessage(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const m = value as Record<string, unknown>;
    if (typeof m.type !== 'string') return;
    const s = typeof m.id === 'string' ? this.sessions.get(m.id) : undefined;
    switch (m.type) {
      case 'ready':
        this.ready = true; this.state();
        for (const session of this.sessions.values()) {session.setConnected(!!this.view?.visible); if(this.view?.visible) session.snapshot();}
        break;
      case 'ack': if(s && typeof m.seq === 'number' && Number.isSafeInteger(m.seq)) s.ack(m.seq); break;
      case 'new': await this.create(); break;
      case 'select': if (s) { this.active = s.id; this.state(); } break;
      case 'input': if (vscode.workspace.isTrusted && s && typeof m.data === 'string' && m.data.length <= 1024 * 1024) s.write(m.data); break;
      case 'resize':
        if (s) { const cols=dimension(m.cols,this.cols,500), rows=dimension(m.rows,this.rows,300); this.cols=cols; this.rows=rows; s.resize(cols, rows); }
        break;
      case 'close': if (s) await this.close(s.id); break;
      case 'restart': await this.restart(); break;
      case 'clear': this.clear(); break;
      case 'copy': if (typeof m.text==='string' && m.text.length <= 1024 * 1024) await vscode.env.clipboard.writeText(m.text); break;
      case 'paste': if(s) await this.paste(s.id); break;
      case 'trust': await vscode.commands.executeCommand('workbench.trust.manage'); break;
      case 'settings': await this.settingsCommand(); break;
      case 'link': if (isWebLink(m.uri)) await this.openLink(m.uri); break;
    }
  }
  private async openLink(uri: string) {
    const answer = await vscode.window.showWarningMessage(`Open this link from terminal output?\n${uri}`, {modal:true}, 'Open');
    if (answer === 'Open') await vscode.env.openExternal(vscode.Uri.parse(uri, true));
  }
  error(error: unknown) { const message = error instanceof Error ? error.message : String(error); this.send({type:'error',message}); void vscode.window.showErrorMessage(`Termlet: ${message}`); }
  private html(webview: vscode.Webview) {
    const nonce = randomBytes(18).toString('base64');
    const uri = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, file)).toString();
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;"><link rel="stylesheet" href="${uri('dist/xterm.css')}"><link rel="stylesheet" href="${uri('media/style.css')}"><title>Termlet</title></head><body><main id="terminals"></main><section id="empty"><div class="prompt-icon">&gt;_</div><h2>Your terminal, within reach</h2><p id="empty-message">A separate terminal, right where you need it.</p><button id="start">New Terminal</button><button id="trust" hidden>Manage Workspace Trust</button><p class="hint">No shell runs until you start one.</p></section><div id="error" role="alert" hidden></div><script nonce="${nonce}" src="${uri('dist/webview.js')}"></script></body></html>`;
  }
  dispose() { for (const s of this.sessions.values()) s.dispose(); this.sessions.clear(); for (const d of this.disposables) d.dispose(); }
}
export function activate(context: vscode.ExtensionContext) {
  const provider = new Termlet(context);
  context.subscriptions.push(provider, vscode.window.registerWebviewViewProvider('sidebarTerminal.terminal',provider,{webviewOptions:{retainContextWhenHidden:true}}));
  for (const [name, action] of Object.entries({focus:()=>provider.focus(),new:()=>provider.newTerminal(),clear:()=>provider.clear(),restart:()=>provider.restart(),kill:()=>provider.close(),switch:()=>provider.switchTerminal(),copy:()=>provider.copy(),paste:()=>provider.pasteFromCommand(),settings:()=>provider.settingsCommand()})) {
    context.subscriptions.push(vscode.commands.registerCommand(`sidebarTerminal.${name}`, async ()=>{try {await action();} catch(e) {provider.error(e);}}));
  }
}
export function deactivate() { /* context subscriptions own terminal disposal. */ }
