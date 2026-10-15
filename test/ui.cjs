const {chromium}=require('playwright-core');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {Session}=require('../dist/session');const pty=require('../dist/vendor/pty');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:420,height:740}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const settings={fontFamily:'monospace',fontSize:13,cursorBlink:false,scrollback:2000};let session;let active;let trusted=true;let output='';const messages=[];
 const send=async message=>{if(!page.isClosed())await page.evaluate(m=>window.dispatchEvent(new MessageEvent('message',{data:m})),message);};
 const state=()=>send({type:'state',sessions:session?[session.info()]:[],active,trusted,host:'local',settings});
 await page.exposeFunction('__post',async m=>{
  messages.push(m);
  if(m.type==='ready')await state();
  if(m.type==='new'){
   const shell=pty.spawn('/bin/sh',['-i'],{name:'xterm-256color',cols:80,rows:24,cwd:'/tmp',env:{...process.env,TERM:'xterm-256color',PS1:'termlet $ '}});shell.onData(d=>output+=d);
   active='test';session=new Session(active,'sh 1','/tmp',shell,2000,m=>{void send(m)},()=>{void state()});await state();session.setConnected(true);session.snapshot();
  }
  if(m.type==='input')session?.write(m.data);
  if(m.type==='resize')session?.resize(m.cols,m.rows);
  if(m.type==='ack')session?.ack(m.seq);
  if(m.type==='clear')session?.clear();
 });
 await page.addInitScript(()=>{window.acquireVsCodeApi=()=>({postMessage:message=>{void window.__post(message);}});});
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
 await page.setViewportSize({width:420,height:740});await page.waitForTimeout(160);await page.screenshot({path:'test/termlet-preview.png'});
 session.setConnected(false);session.write("printf 'HIDDEN_%s\\n' KEPT\r");await page.waitForTimeout(100);session.setConnected(true);session.snapshot();await page.waitForFunction(()=>document.querySelector('.xterm-rows').textContent.includes('HIDDEN_KEPT'));
 assert.deepEqual(errors,[]);console.log('PASS: Chromium UI + real PTY: trust/no-auto-start, input/output, Unicode, resize, replay, hidden recovery, toolbar/footer removal, no JS errors.');
 }finally{session?.dispose();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
