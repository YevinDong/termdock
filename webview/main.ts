import { Terminal, ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { handleClipboardKey, handleNativePaste } from './clipboard';
declare function acquireVsCodeApi(): {postMessage(message: unknown): void};
const vscode = acquireVsCodeApi();
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const post = (message: unknown) => vscode.postMessage(message);
interface Settings { fontFamily: string; fontSize: number; cursorBlink: boolean; scrollback: number; }
interface Info { id:string; name:string; running:boolean; cwd:string; exitCode?:number; }
interface Tab { term:Terminal; fit:FitAddon; element:HTMLDivElement; seq:number; initialized:boolean; info:Info; }
const tabs = new Map<string,Tab>();
let active: string | undefined;
let settings: Settings = {fontFamily:'monospace',fontSize:14,cursorBlink:true,scrollback:2000};
let fitTimer: ReturnType<typeof setTimeout> | undefined;
function theme(): ITheme {
  const css = getComputedStyle(document.body);
  const color = (name: string, fallback: string) => css.getPropertyValue(`--vscode-${name}`).trim() || fallback;
  const dark = !document.body.classList.contains('vscode-light');
  const result: ITheme = {background:color('terminal-background',color('editor-background',dark?'#1e1e1e':'#ffffff')),foreground:color('terminal-foreground',color('editor-foreground',dark?'#cccccc':'#333333')),cursor:color('terminalCursor-foreground',color('editor-foreground',dark?'#cccccc':'#333333')),selectionBackground:color('terminal-selectionBackground',dark?'#3a3d41':'#add6ff')};
  const names = ['black','red','green','yellow','blue','magenta','cyan','white','brightBlack','brightRed','brightGreen','brightYellow','brightBlue','brightMagenta','brightCyan','brightWhite'] as const;
  for(const n of names) { const value=css.getPropertyValue(`--vscode-terminal-ansi${n[0].toUpperCase()+n.slice(1)}`).trim(); if(value) result[n]=value; }
  return result;
}
function updateTheme() { for (const tab of tabs.values()) tab.term.options.theme=theme(); }
function fit() {
  const tab=active&&tabs.get(active); if(!tab || !tab.initialized || tab.element.clientWidth < 20 || tab.element.clientHeight < 20) return;
  try {const size=tab.fit.proposeDimensions();if(size) tab.term.resize(Math.max(2,Math.min(500,size.cols)),Math.max(2,Math.min(300,size.rows)));} catch { /* Hidden view has no dimensions yet. */ }
}
function scheduleFit() { if(fitTimer) clearTimeout(fitTimer); fitTimer=setTimeout(fit,40); }
function focus() { const tab=active&&tabs.get(active); if(tab) tab.term.focus(); }
function copy() { const tab=active?tabs.get(active):undefined; if(tab?.term.hasSelection()) post({type:'copy',text:tab.term.getSelection()}); }
function paste() { if(active) post({type:'paste',id:active}); }
function create(info:Info) {
  const element=document.createElement('div'); element.className='terminal-pane'; element.hidden=true; el('terminals').appendChild(element);
  const links={
    allowNonHttpProtocols:false,
    activate:(event:MouseEvent,uri:string)=>{if(event.button===0&&!term.hasSelection()) post({type:'link',uri});},
    hover:(_event:MouseEvent,uri:string)=>{element.title=uri;element.setAttribute('data-vscode-context',JSON.stringify({termdockLink:uri}));},
    leave:()=>{element.removeAttribute('title');element.removeAttribute('data-vscode-context');}
  };
  const term=new Terminal({...settings,theme:theme(),allowProposedApi:false,convertEol:false,macOptionIsMeta:true,macOptionClickForcesSelection:true,scrollOnUserInput:true,linkHandler:links});
  const fitter=new FitAddon(); term.loadAddon(fitter); term.loadAddon(new WebLinksAddon(links.activate,links)); term.open(element);
  const tab:Tab={term,fit:fitter,element,seq:0,initialized:false,info}; tabs.set(info.id,tab);
  term.onData(data=>{if(tab.info.running) post({type:'input',id:info.id,data});});
  term.onResize(size=>post({type:'resize',id:info.id,...size}));
  term.attachCustomKeyEventHandler(e=>handleClipboardKey(e,navigator.platform,{copy,paste}));
  element.addEventListener('paste',e=>handleNativePaste(e,paste),true);
  return tab;
}
function applySettings(value:Settings) {
  settings=value;
  for(const tab of tabs.values()) {tab.term.options.fontFamily=value.fontFamily;tab.term.options.fontSize=value.fontSize;tab.term.options.cursorBlink=value.cursorBlink;}
  scheduleFit();
}
function state(message:{sessions:Info[];active?:string;trusted:boolean;host:string;settings:Settings}) {
  applySettings(message.settings);
  const ids=new Set(message.sessions.map(s=>s.id));
  for(const [id,tab] of tabs) if(!ids.has(id)) {tab.term.dispose();tab.element.remove();tabs.delete(id);}
  for(const info of message.sessions) {
    const tab=tabs.get(info.id)||create(info);tab.info=info;
  }
  const changed=active!==message.active;
  active=message.active;
  for(const [id,tab] of tabs) tab.element.hidden=id!==active;
  const current=active&&tabs.get(active);
  el('empty').hidden=tabs.size>0;
  el('start').hidden=!message.trusted; el('trust').hidden=message.trusted;
  el('empty-message').textContent=message.trusted?'A separate terminal, right where you need it.':'Trust this workspace before starting a shell.';
  scheduleFit(); if(current&&changed) setTimeout(focus,50);
}
window.addEventListener('message',event=>{
  const m=event.data;if(!m||typeof m.type!=='string') return;
  const tab=typeof m.id==='string'?tabs.get(m.id):undefined;
  switch(m.type) {
    case 'state':state(m);break;
    case 'settings':applySettings(m.settings);break;
    case 'snapshot':
      if(tab) {tab.initialized=false;tab.seq=m.seq;tab.term.resize(m.cols,m.rows);tab.term.write('\x1bc'+m.data,()=>{tab.initialized=true;post({type:'ack',id:m.id,seq:m.seq});if(m.id===active) {scheduleFit();focus();}});}
      break;
    case 'data': if(tab&&m.seq>tab.seq) {tab.seq=m.seq;tab.term.write(m.data,()=>post({type:'ack',id:m.id,seq:m.seq}));}break;
    case 'copy':copy();break;
    case 'paste':if(tab) {tab.term.paste(m.text);if(m.id===active) tab.term.focus();}break;
    case 'focus':focus();break;
    case 'visible':scheduleFit();break;
    case 'error':el('error').textContent=m.message;el('error').hidden=false;setTimeout(()=>{el('error').hidden=true;},12000);break;
  }
});
el('start').addEventListener('click',()=>post({type:'new'}));
el('trust').addEventListener('click',()=>post({type:'trust'}));
new ResizeObserver(scheduleFit).observe(el('terminals'));
new MutationObserver(updateTheme).observe(document.body,{attributes:true,attributeFilter:['class','style']});
window.addEventListener('resize',scheduleFit);
document.fonts.ready.then(scheduleFit);
post({type:'ready'});
