const test=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');const path=require('node:path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const until=async predicate=>{const end=Date.now()+3000;while(!predicate()){if(Date.now()>end)throw Error('Timed out waiting for host event');await delay(10)}};
test('VS Code host + real PTY: native controls, trust, session switch, clipboard cancellation, lifecycle',{timeout:15000},async()=>{
 const subscriptions=[];const commands=new Map;let provider;let handler;let visibleHandler;let disposeHandler;let view;let trusted=false;let state;let clipboard='';let clipboardRead;let warningAnswer='default';let pickAnswer;let lastPicker;const opened=[];const contexts=new Map;const messages=[];const warnings=[];
 const disposable=()=>({dispose(){}});
 const uri=filename=>({fsPath:filename,toString(){return `vscode-resource:${filename}`}});
 const settings={shell:'/bin/sh',shellArgs:['-i'],cwd:'/tmp',scrollback:2000};
 const fake={
  Uri:{parse:value=>({toString:()=>value}),joinPath:(base,...parts)=>uri(path.join(base.fsPath,...parts))},
  workspace:{get isTrusted(){return trusted},workspaceFolders:[],getConfiguration:section=>({get:(key,fallback)=>section==='termdock'?(settings[key]??fallback):fallback}),onDidChangeConfiguration:disposable,onDidGrantWorkspaceTrust:disposable},
  window:{activeTextEditor:undefined,registerWebviewViewProvider:(id,p)=>{provider=p;return disposable()},showWarningMessage:async(text,...args)=>{warnings.push(text);return warningAnswer==='default'?args.at(-1):warningAnswer},showErrorMessage:async text=>{throw new Error(text)},showQuickPick:async(items,options)=>{lastPicker={items,options};return typeof pickAnswer==='function'?pickAnswer(items):pickAnswer}},
  commands:{registerCommand:(name,action)=>{commands.set(name,action);return disposable()},executeCommand:async(name,...args)=>{
   if(name==='setContext'){contexts.set(args[0],args[1]);return;}
   if(name==='termdock.terminal.focus'&&!view){view={visible:true,webview:{options:{},html:'',cspSource:'vscode-resource:',asWebviewUri:uri=>uri,onDidReceiveMessage:cb=>{handler=cb;return disposable()},postMessage:async m=>{messages.push(m);if(m.type==='state')state=m;if(m.type==='data'||m.type==='snapshot')setTimeout(()=>handler({type:'ack',id:m.id,seq:m.seq}),0);return true}},show(){},onDidDispose:cb=>{disposeHandler=cb;return disposable()},onDidChangeVisibility:cb=>{visibleHandler=cb;return disposable()}};provider.resolveWebviewView(view);handler({type:'ready'});}
  }},
  env:{openExternal:async target=>{opened.push(target.toString());return true},remoteName:'ssh-remote',clipboard:{writeText:async text=>{clipboard=text},readText:async()=>clipboardRead?clipboardRead():clipboard}}
 };
 const original=Module._load;Module._load=function(name,...rest){if(name==='vscode')return fake;return original.call(this,name,...rest)};
 const pastes=()=>messages.filter(m=>m.type==='paste');
 try{
  delete require.cache[require.resolve('../dist/extension')];const extension=require('../dist/extension');extension.activate({subscriptions,extensionPath:path.resolve('.'),extensionUri:uri(path.resolve('.'))});
  assert.equal(contexts.get('termdock.canCreate'),true);assert.equal(contexts.get('termdock.hasSessions'),false);
  await commands.get('termdock.new')();await delay(40);assert.equal(state.sessions.length,0);assert.equal(warnings.length,1);assert.match(view.webview.html,/default-src 'none'/);assert.match(view.webview.html,/script-src 'nonce-/);assert.equal(view.webview.options.localResourceRoots.length,2);
  assert.equal(view.title,'Termdock');assert.equal(view.description,undefined);assert.doesNotMatch(view.webview.html,/<header|<footer|id="toolbar"|id="sessions"|id="more"|id="status"|id="host"|Sidebar Terminal/);
  trusted=true;await commands.get('termdock.new')();await delay(100);assert.equal(state.sessions.length,1);assert.equal(state.host,'ssh-remote');const first=state.active;
  assert.equal(view.description,'sh 1');assert.equal(contexts.get('termdock.activeRunning'),true);
  handler({type:'input',id:first,data:"printf 'HOST_%s\\n' OK\r"});await until(()=>messages.some(m=>m.type==='data'&&m.data.includes('HOST_OK')));
  await commands.get('termdock.new')();await delay(40);const second=state.active;assert.notEqual(first,second);assert.equal(view.description,'sh 2');
  pickAnswer=items=>items.find(item=>item.id===first);await commands.get('termdock.switch')();assert.equal(state.active,first);assert.equal(view.description,'sh 1');assert.equal(lastPicker.options.title,'Termdock: Switch Terminal');assert.match(lastPicker.items[0].detail,/Remote · ssh-remote · \/tmp/);
  pickAnswer=undefined;await commands.get('termdock.switch')();assert.equal(state.active,first,'cancel keeps active terminal');
  clipboard='BuiltinNodeDefinition';let count=pastes().length;
  handler({type:'paste',id:first});await until(()=>pastes().length===count+1);assert.equal(pastes().at(-1).text,'BuiltinNodeDefinition');
  await commands.get('termdock.paste')();assert.equal(pastes().length,count+2,'second intentional paste is preserved');assert.equal(pastes().at(-1).id,first);
  await commands.get('termdock.copy')();assert.equal(messages.at(-1).type,'copy');handler({type:'copy',text:'selection'});await delay(10);assert.equal(clipboard,'selection');
  clipboard='line one\nline two';warningAnswer=undefined;count=pastes().length;let warningCount=warnings.length;
  await commands.get('termdock.paste')();assert.equal(warnings.length,warningCount+1);assert.equal(pastes().length,count,'multiline cancellation sends nothing');
  warningAnswer='Paste';await commands.get('termdock.paste')();assert.equal(pastes().length,count+1);assert.equal(pastes().at(-1).text,clipboard);
  clipboard='rm -rf ~\x0f';warningAnswer=undefined;count=pastes().length;warningCount=warnings.length;
  await commands.get('termdock.paste')();assert.equal(warnings.length,warningCount+1);assert.match(warnings.at(-1),/control characters/);assert.equal(pastes().length,count,'control-character cancellation sends nothing');warningAnswer='default';
  // Terminal output links: only confirmed http(s) links reach openExternal.
  for(const uri of ['file:///etc/passwd','command:workbench.action.terminal.new','javascript:alert(1)'])handler({type:'link',uri});await delay(20);assert.equal(opened.length,0);
  warningAnswer=undefined;handler({type:'link',uri:'https://example.com/'});await delay(20);assert.equal(opened.length,0,'declined link stays closed');
  warningAnswer='default';handler({type:'link',uri:'https://example.com/'});await until(()=>opened.length===1);assert.equal(opened[0],'https://example.com/');
  const openLink=commands.get('termdock.openLink');assert.equal(typeof openLink,'function');
  for(const context of [undefined,{},null,{termdockLink:123},{termdockLink:'file:///etc/passwd'},{termdockLink:'command:workbench.action.terminal.new'}])await openLink(context);
  assert.equal(opened.length,1,'context commands validate untrusted targets too');
  warningAnswer=undefined;await openLink({termdockLink:'https://example.org/context'});assert.equal(opened.length,1,'context opening also requires confirmation');
  warningAnswer='default';await openLink({termdockLink:'https://example.org/context'});assert.equal(opened.at(-1),'https://example.org/context');
  // Capture the intended target before a delayed clipboard read; switching must not redirect the paste.
  let release;clipboardRead=()=>new Promise(r=>{release=r});count=pastes().length;handler({type:'paste',id:first});await until(()=>!!release);
  pickAnswer=items=>items.find(item=>item.id===second);await commands.get('termdock.switch')();release('target remains first');await until(()=>pastes().length===count+1);assert.equal(pastes().at(-1).id,first);clipboardRead=undefined;
  // Closing a target while clipboard access is pending must not deliver a stale paste.
  release=undefined;clipboardRead=()=>new Promise(r=>{release=r});count=pastes().length;handler({type:'paste',id:second});await until(()=>!!release);await commands.get('termdock.kill')();release('must not paste');await delay(30);assert.equal(pastes().length,count);clipboardRead=undefined;assert.equal(state.active,first);
  const before=messages.length;view.visible=false;visibleHandler();handler({type:'input',id:first,data:"printf 'HIDDEN_%s\\n' OK\r"});await delay(100);assert.ok(!messages.slice(before).some(m=>m.type==='data'));
  view.visible=true;visibleHandler();await until(()=>messages.some(m=>m.type==='snapshot'&&m.data.includes('HIDDEN_OK')));
  handler({type:'resize',id:first,cols:NaN,rows:Infinity});handler({type:'input',id:first,data:'exit 0\r'});await until(()=>!state.sessions[0].running);assert.equal(view.description,'sh 1 · exited (0)');assert.equal(contexts.get('termdock.activeRunning'),false);
  await commands.get('termdock.kill')();assert.equal(state.sessions.length,0);assert.equal(view.description,undefined);assert.equal(contexts.get('termdock.hasSessions'),false);
  await commands.get('termdock.new')();await delay(60);assert.equal(state.sessions.length,1);
  disposeHandler();for(const subscription of subscriptions.reverse())subscription.dispose();
 }finally{Module._load=original;for(const subscription of subscriptions.reverse())try{subscription.dispose()}catch{}}
});
