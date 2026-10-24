const {chromium}=require('playwright-core');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {Session}=require('../dist/session');const pty=require('../dist/vendor/pty');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try { for (const platform of ['Linux x86_64','Win32','MacIntel']) {
 const page=await browser.newPage({viewport:{width:420,height:740}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const settings={fontFamily:'monospace',fontSize:13,cursorBlink:false,scrollback:2000};let session;let active;let trusted=true;let output='';let interactionFixture=false;const messages=[];
 const send=async message=>{if(!page.isClosed())await page.evaluate(m=>window.dispatchEvent(new MessageEvent('message',{data:m})),message);};
 const state=()=>send({type:'state',sessions:session?[session.info()]:[],active,trusted,host:'local',settings});
 await page.exposeFunction('__post',async m=>{
  messages.push(m);
  if(m.type==='ready')await state();
  if(m.type==='new'){
   const shell=pty.spawn('/bin/sh',['-i'],{name:'xterm-256color',cols:80,rows:24,cwd:'/tmp',env:{...process.env,TERM:'xterm-256color',PS1:'termdock $ '}});shell.onData(d=>output+=d);
   active='test';session=new Session(active,'sh 1','/tmp',shell,2000,m=>{void send(m)},()=>{void state()});await state();session.setConnected(true);session.snapshot();
  }
  if(m.type==='input'&&!interactionFixture)session?.write(m.data);
  if(m.type==='resize')session?.resize(m.cols,m.rows);
  if(m.type==='ack')session?.ack(m.seq);
  if(m.type==='clear')session?.clear();
 });
 await page.addInitScript(platform=>{Object.defineProperty(navigator,'platform',{get:()=>platform});window.acquireVsCodeApi=()=>({postMessage:message=>{void window.__post(message);}});},platform);
 let html=fs.readFileSync('src/extension.ts','utf8').match(/return `(<\!DOCTYPE html>[\s\S]*?)`;/)[1];
 html=html.replace(/\$\{webview\.cspSource\}/g,'https://test.local').replace(/\$\{nonce\}/g,'testnonce').replace(/\$\{uri\('([^']+)'\)\}/g,(_,file)=>`https://test.local/${file}`);
 html=html.replace('<body>','<body class="vscode-dark" style="--vscode-foreground:#cccccc;--vscode-editor-background:#1e1e1e;--vscode-button-background:#007acc">');
 await page.route('https://test.local/**',route=>{
  const pathname=new URL(route.request().url()).pathname.slice(1);if(!pathname)return route.fulfill({contentType:'text/html',body:html});
  const file=path.join(process.cwd(),pathname);return route.fulfill({contentType:pathname.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(file)});
 });
 try{
 await page.goto('https://test.local/');await page.locator('#start').waitFor({state:'visible'});assert.equal(session,undefined,'no auto-spawn');
 trusted=false;await state();assert.equal(await page.locator('#start').isVisible(),false);await page.locator('#trust').click();assert.ok(messages.some(m=>m.type==='trust'));trusted=true;await state();
 await page.locator('#start').click();await page.locator('.xterm-helper-textarea').waitFor({state:'attached'});await page.waitForTimeout(180);
 await page.locator('.xterm-helper-textarea').focus();await page.keyboard.type("printf 'BROWSER_%s\\n' SUCCESS");await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('.xterm-rows').textContent.includes('BROWSER_SUCCESS'));
 assert.match(output,/BROWSER_SUCCESS/);const firstCols=session.pty.cols;await page.setViewportSize({width:620,height:500});await page.waitForTimeout(180);assert.ok(session.pty.cols>firstCols,'resize propagated to PTY');
 await page.keyboard.type("printf 'UNICODE_%s\\n' 你好");await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('.xterm-rows').textContent.includes('UNICODE_你好'));
 // Repeated snapshots after queued data must not duplicate terminal contents.
 session.write("printf 'SNAPSHOT_%s\\n' ONCE\r");await page.waitForFunction(()=>document.querySelector('.xterm-rows').textContent.includes('SNAPSHOT_ONCE'));
 session.snapshot();session.snapshot();await page.waitForTimeout(120);const text=await page.locator('.xterm-rows').innerText();assert.equal(text.split('SNAPSHOT_ONCE').length-1,1);
 assert.equal(await page.locator('header, footer, #toolbar, #sessions, #menu').count(),0,'terminal content has no duplicate toolbar/footer');
 await page.setViewportSize({width:420,height:740});await page.waitForTimeout(160);await page.screenshot({path:'test/termdock-preview.png'});
 session.setConnected(false);session.write("printf 'HIDDEN_%s\\n' KEPT\r");await page.waitForTimeout(100);session.setConnected(true);session.snapshot();await page.waitForFunction(()=>document.querySelector('.xterm-rows').textContent.includes('HIDDEN_KEPT'));
 // Deterministic terminal output; record mouse reports without sending them to the shell.
 interactionFixture=true;
 const plain='https://example.com/path?q=1', target='https://example.org/target';
 const wrapped='https://example.net/'+ 'segment/'.repeat(20);
 // Observe write completion without exposing xterm internals to tests.
 await page.evaluate(()=>{
  window.__acks=0;const post=window.__post;window.__post=m=>{if(m.type==='ack')window.__acks++;return post(m);};
  window.addEventListener('contextmenu',e=>{window.__linkContext=JSON.parse(e.target.closest('[data-vscode-context]')?.getAttribute('data-vscode-context')||'{}');});
 });
 const display=async data=>{
  const count=await page.evaluate(()=>window.__acks);
  await send({type:'snapshot',id:active,seq:session.seq,cols:session.pty.cols,rows:session.pty.rows,data});
  await page.waitForFunction(count=>window.__acks>count,count);
 };
 const cell=async(x,y)=>{
  const box=await page.locator('.xterm-screen').boundingBox();
  return {x:box.x+(x+.5)*box.width/session.pty.cols,y:box.y+(y+.5)*box.height/session.pty.rows};
 };
 const hover=async(x,y,uri)=>{
  const p=await cell(x,y);await page.mouse.move(p.x,p.y);
  await page.waitForFunction(uri=>document.querySelector('.terminal-pane').title===uri,uri);
  assert.equal(await page.locator('.xterm-cursor-pointer').count(),1);
  assert.equal(JSON.parse(await page.locator('.terminal-pane').getAttribute('data-vscode-context')).termdockLink,uri);
  return p;
 };
 // Reproduce piAgent-style label links through a real PTY, then hide/reconnect/replay.
 session.write(`printf '\\033[2J\\033[H\\033]8;;${target}\\007PI_AGENT_LINK\\033]8;;\\007\\n'\r`);
 await page.waitForFunction(()=>document.querySelector('.xterm-rows').textContent.startsWith('PI_AGENT_LINK'));
 await hover(3,0,target);
 const beforeReplay=await page.evaluate(()=>window.__acks);
 session.setConnected(false);session.setConnected(true);await new Promise(r=>session.snapshot(r));
 await page.waitForFunction(count=>window.__acks>count,beforeReplay);
 const restoredLink=await hover(3,0,target);await page.mouse.click(restoredLink.x,restoredLink.y);await page.waitForTimeout(30);
 assert.equal(messages.filter(m=>m.type==='link').at(-1).uri,target,'OSC 8 label stays clickable after host snapshot');
 await display(`plain ${plain}\r\nlabel \x1b]8;;${target}\x07URL\x1b]8;;\x07\r\n${wrapped}`);
 let p=await hover(8,0,plain);let count=messages.filter(m=>m.type==='link').length;
 await page.mouse.click(p.x,p.y);await page.waitForTimeout(30);
 assert.equal(messages.filter(m=>m.type==='link').length,count+1);assert.equal(messages.filter(m=>m.type==='link').at(-1).uri,plain);
 p=await hover(7,1,target);count=messages.filter(m=>m.type==='link').length;
 await page.mouse.click(p.x,p.y);await page.waitForTimeout(30);
 assert.equal(messages.filter(m=>m.type==='link').length,count+1);assert.equal(messages.filter(m=>m.type==='link').at(-1).uri,target);
 count=messages.filter(m=>m.type==='link').length;
 await page.mouse.click(p.x,p.y,{button:'right'});await page.waitForTimeout(30);
 assert.equal(messages.filter(m=>m.type==='link').length,count,'right click offers context instead of opening');
 assert.equal(await page.evaluate(()=>window.__linkContext.termdockLink),target,'native context menu receives actual href');
 p=await hover(6,1,target);await page.mouse.move(p.x,p.y);await page.mouse.down();const endOfLabel=await cell(8,1);await page.mouse.move(endOfLabel.x,endOfLabel.y,{steps:4});await page.mouse.up();await page.waitForTimeout(30);
 assert.equal(messages.filter(m=>m.type==='link').length,count,'dragging link text selects instead of opening');
 p=await hover(5,3,wrapped);await page.mouse.click(p.x,p.y);await page.waitForTimeout(30);
 assert.equal(messages.filter(m=>m.type==='link').at(-1).uri,wrapped,'wrapped URLs retain full target');
 await page.mouse.move(410,730);await page.waitForTimeout(30);
 assert.equal(await page.locator('.terminal-pane').getAttribute('data-vscode-context'),null,'link context clears on leave');
 // Replayed plain URLs must remain detectable after a reset, not just live output.
 await display(`plain ${plain}`);await hover(8,0,plain);
 // Agent TUIs enable mouse reporting, including in the alternate screen.
 for(const alternate of [false,true]) {
  await display(`${alternate?'\x1b[?1049h':''}COPY_ME agent output\r\n\x1b[?1000h\x1b[?1006h`);
  await page.waitForFunction(()=>document.querySelector('.xterm').classList.contains('enable-mouse-events'));
  const start=await cell(0,0),end=await cell(7,0);const from=messages.length;
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();
  assert.ok(messages.slice(from).some(m=>m.type==='input'&&m.data.startsWith('\x1b[<')),'unmodified mouse still reaches CLI');
  const modifier=platform==='MacIntel'?'Alt':'Shift';await page.keyboard.down(modifier);const forcedFrom=messages.length;
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();await page.keyboard.up(modifier);
  await page.keyboard.press(platform==='MacIntel'?'Meta+c':'Control+Shift+c');await page.waitForTimeout(30);
  assert.equal(messages.filter(m=>m.type==='copy').at(-1)?.text,'COPY_ME',`${platform}: forced selection copies in ${alternate?'alternate':'normal'} screen`);
  assert.ok(!messages.slice(forcedFrom).some(m=>m.type==='input'&&m.data.startsWith('\x1b[<')),'selection gesture is not sent to CLI');
 }
 assert.deepEqual(errors,[]);console.log(`PASS: ${platform}: Chromium UI + real PTY, URL/OSC 8/wrapped links, right-click context, mouse-mode selection/copy, replay, no JS errors.`);
 }finally{session?.dispose();await page.close();}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
