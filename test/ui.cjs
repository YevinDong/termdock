const {chromium}=require('playwright-core');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {Session}=require('../dist/session');const pty=require('../dist/vendor/pty');const {shellEnvironment}=require('../dist/core');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try { for (const platform of ['Linux x86_64','Win32','MacIntel']) {
 const page=await browser.newPage({viewport:{width:420,height:740}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const settings={fontFamily:'monospace',fontSize:13,cursorBlink:false,scrollback:2000};let session;let active;let trusted=true;let output='';let interactionFixture=false;let delayed;const messages=[];
 const send=async message=>{if(!page.isClosed())await page.evaluate(m=>window.dispatchEvent(new MessageEvent('message',{data:m})),message);};
 const state=()=>{if(session)session.mirror.options.cursorBlink=settings.cursorBlink;return send({type:'state',sessions:session?[session.info()]:[],active,trusted,host:'local',settings});};
 await page.exposeFunction('__post',async m=>{
  messages.push(m);
  if(m.type==='ready')await state();
  if(m.type==='new'){
   const shell=pty.spawn('/bin/sh',['-i'],{name:'xterm-256color',cols:80,rows:24,cwd:'/tmp',env:shellEnvironment({...process.env,PS1:'termdock $ '})});shell.onData(d=>output+=d);
   active='test';session=new Session(active,'sh 1','/tmp',shell,2000,m=>{if(delayed)delayed.push(m);else void send(m)},()=>{void state()});await state();session.setConnected(true);session.snapshot();
  }
  if(m.type==='input'&&!interactionFixture){if(m.binary===true)session?.writeBinary(m.data);else session?.write(m.data);}
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
 const screen=await page.locator('.xterm-screen').boundingBox();
 const rowHeight=screen.height/session.pty.rows;
 await page.setViewportSize({width:420,height:Math.ceil(rowHeight*session.pty.rows)});
 await page.waitForFunction(()=>{
  const screen=document.querySelector('.xterm-screen').getBoundingClientRect();
  const sidebar=document.querySelector('#terminals').getBoundingClientRect();
  const scrollbar=document.querySelector('.xterm .scrollbar.vertical').getBoundingClientRect();
  return screen.y>sidebar.y && screen.bottom<=sidebar.bottom && screen.right<=scrollbar.left+0.5;
 });
 await page.setViewportSize({width:420,height:740});
 session.setConnected(false);session.write("printf 'HIDDEN_%s\\n' KEPT\r");await page.waitForTimeout(100);session.setConnected(true);session.snapshot();await page.waitForFunction(()=>document.querySelector('.xterm-rows').textContent.includes('HIDDEN_KEPT'));
 // Deterministic terminal output; record mouse reports without sending them to the shell.
 interactionFixture=true;
 const plain='https://example.com/path?q=1', target='https://example.org/target';
 const wrapped='https://example.net/'+ 'segment/'.repeat(20);
 // Observe write completion without exposing xterm internals to tests.
 await page.evaluate(()=>{
  window.__acks=0;const post=window.__post;window.__post=async m=>{if(m.type==='ack')window.__acks++;await post(m);if(m.type==='resize')window.__lastFit=m.cols;};
  window.addEventListener('contextmenu',e=>{window.__linkContext=JSON.parse(e.target.closest('[data-vscode-context]')?.getAttribute('data-vscode-context')||'{}');});
 });
 const display=async data=>{
  const count=await page.evaluate(()=>window.__acks);
  await send({type:'snapshot',id:active,seq:session.seq,cols:session.pty.cols,rows:session.pty.rows,data});
  await page.waitForFunction(count=>window.__acks>count,count);
 };
 const visibleRows=page.locator('.xterm-rows > div');
 const raceCols=session.pty.cols;
 const raceGrid=await page.locator('.xterm-screen').boundingBox();
 const raceScrollbar=await page.locator('.xterm .scrollbar.vertical').boundingBox();
 const narrowCols=raceCols-6;
 const raceWidth=Math.floor(raceGrid.x+raceScrollbar.width+(narrowCols+0.5)*raceGrid.width/raceCols);
 delayed=[];
 await new Promise(done=>session.snapshot(done));
 await page.locator('#terminals').evaluate((element,width)=>{element.style.width=`${width}px`;},raceWidth);
 await page.waitForFunction(cols=>window.__lastFit===cols,narrowCols,{timeout:5000});
 assert.equal(session.pty.cols,narrowCols);
 const delayedMessages=delayed;delayed=undefined;
 assert.deepEqual(delayedMessages.filter(m=>m.type==='snapshot'||m.type==='resize').map(m=>[m.type,m.cols]),[['snapshot',raceCols],['resize',narrowCols]]);
 await page.evaluate(packets=>{
  document.getElementById('terminals').style.width='';
  for(const data of packets)window.dispatchEvent(new MessageEvent('message',{data}));
 },delayedMessages);
 await page.waitForFunction(({cols,width})=>window.__lastFit===cols && Math.abs(document.querySelector('.xterm-screen').getBoundingClientRect().width-width)<1,
  {cols:raceCols,width:raceGrid.width},{timeout:5000});
 assert.equal(session.pty.cols,raceCols,'late snapshot and resize must not strand the PTY at its narrow width');
 const mixedPrefix='邮件处理（ SMTP、 MIME 等） SQLAlchemy';
 const prefixCells=Array.from(mixedPrefix, char=>char.codePointAt(0)>127?2:1).reduce((total,width)=>total+width,0);
 const padding='0'.repeat(session.pty.cols-prefixCells-2);
 const styledPrefix=mixedPrefix.replace(/SMTP|MIME|SQLAlchemy/g, word=>`\x1b[1m${word}\x1b[0m`);
 const mixedRows=['12','好'].map(tail=>mixedPrefix+padding+tail);
 await display(`\x1b[?1049h\x1b[?25l${styledPrefix}${padding}12\r\n${styledPrefix}${padding}好`);
 await page.waitForFunction(expected=>expected.every((text,index)=>document.querySelector('.xterm-rows').children[index]?.textContent===text),mixedRows);
 const layout=await page.locator('.xterm').evaluate(terminal=>{
  const rows=Array.from(terminal.querySelector('.xterm-rows').children).slice(0,2);
  const overflow=rows.map(row=>{
   const text=document.createRange();
   text.selectNodeContents(row);
   return text.getBoundingClientRect().right-row.getBoundingClientRect().right;
  });
  const measured=terminal.querySelector('.xterm-width-cache-measure-container span');
  const rendered=rows[0].querySelector('span');
  const spacing=CSS.supports('text-spacing-trim','space-all')
   ? [measured,rendered].map(span=>getComputedStyle(span).getPropertyValue('text-spacing-trim'))
   : null;
  return {overflow,spacing};
 });
 assert.ok(layout.overflow.every(pixels=>pixels<=1),`mixed CJK rows must fit the grid: ${layout.overflow} px overflow`);
 if(layout.spacing)assert.deepEqual(layout.spacing,['space-all','space-all'],'measurement and rendering must use untrimmed CJK punctuation');
 const fill='0'.repeat(session.pty.cols-2);
 await display(`\x1b[?1049h\x1b[?25l${fill}𰀀👩‍💻`);
 await page.waitForFunction(()=>document.querySelector('.xterm-rows').textContent.includes('👩‍💻'));
 assert.equal(await visibleRows.nth(0).textContent(),fill+'𰀀');
 assert.equal((await visibleRows.nth(1).textContent()).trimEnd(),'👩‍💻');
 const wideCols=session.pty.cols;
 const grid=await page.locator('.xterm-screen').boundingBox();
 const scrollbar=await page.locator('.xterm .scrollbar.vertical').boundingBox();
 const narrowWidth=Math.floor(grid.x+scrollbar.width+(wideCols-1.5)*grid.width/wideCols);
 await page.setViewportSize({width:narrowWidth,height:740});
 await page.waitForFunction(width=>document.querySelector('.xterm-screen').getBoundingClientRect().width<width,grid.width);
 assert.equal(session.pty.cols,wideCols-2);
 assert.equal(await visibleRows.nth(0).textContent(),fill,'alternate screen hides cells outside the new grid');
 assert.equal((await visibleRows.nth(1).textContent()).trimEnd(),'👩‍💻','the next row retains its full grapheme');
 const narrowGrid=await page.locator('.xterm-screen').boundingBox();
 await page.setViewportSize({width:460,height:740});
 await page.waitForFunction(({width,text})=>document.querySelector('.xterm-screen').getBoundingClientRect().width>width && document.querySelector('.xterm-rows').firstElementChild?.textContent===text,
  {width:narrowGrid.width,text:fill+'𰀀'},{timeout:5000});
 const cell=async(x,y)=>{
  const box=await page.locator('.xterm-screen').boundingBox();
  return {x:box.x+(x+.5)*box.width/session.pty.cols,y:box.y+(y+.5)*box.height/session.pty.rows};
 };
 const hover=async(x,y,uri)=>{
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const away=await cell(0,session.pty.rows-2);await page.mouse.move(away.x,away.y);
  const p=await cell(x,y);await page.mouse.move(p.x,p.y);
  await page.waitForFunction(uri=>document.querySelector('.terminal-pane').title===uri && document.querySelector('.xterm-cursor-pointer')!==null,uri);
  assert.equal(JSON.parse(await page.locator('.terminal-pane').getAttribute('data-vscode-context')).termdockLink,uri);
  return p;
 };
 if(process.env.PI_TUI_PATH){
  // Run pi's actual Markdown/capability detection with the production shell environment.
  const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
  session.write(`${quote(process.execPath)} ${quote(path.join(__dirname,'pi-output.mjs'))}\r`);
  await page.waitForFunction(()=>document.querySelector('.xterm-rows').textContent.includes('PI_RENDER_DONE'));
  const rendered=await page.locator('.xterm-rows').textContent();
  assert.match(rendered,/PI_LINKS=true/,'pi must detect hyperlink support in a Termdock shell');
  assert.match(rendered,/PR：#822。/,'pi renders the PR label without its fallback URL');
  const checkPiLinks=async()=>{
   await page.waitForFunction(()=>document.querySelector('.xterm-rows').textContent.includes('#822'));
   for(const text of ['#822','https://github.com','pull/822']){
    const point=await page.evaluate(text=>{
     const walker=document.createTreeWalker(document.querySelector('.xterm-rows'),NodeFilter.SHOW_TEXT);const nodes=[];let node;
     while(node=walker.nextNode())nodes.push(node);
     let at=nodes.map(n=>n.textContent).join('').indexOf(text);if(at<0)return;
     at+=text.length-1; // Check the URL's last character even when it spans DOM rows/spans.
     for(const node of nodes){
      if(at>=node.textContent.length){at-=node.textContent.length;continue;}
      const range=document.createRange();range.setStart(node,at);range.setEnd(node,at+1);
      const box=range.getBoundingClientRect();return{x:box.x+box.width/2,y:box.y+box.height/2};
     }
    },text);
    assert.ok(point,`pi output contains ${text}: ${await page.locator('.xterm-rows').textContent()}`);await page.mouse.move(point.x,point.y);
    const uri='https://github.com/Qiyin-Tech/orchestra-backend/pull/822';
    await page.waitForFunction(uri=>document.querySelector('.terminal-pane').title===uri,uri);
    assert.equal(await page.locator('.xterm-cursor-pointer').count(),1);
    if(text==='#822'&&platform==='MacIntel')await page.screenshot({path:'test/termdock-pi-preview.png'});
    const count=messages.filter(m=>m.type==='link').length;await page.mouse.click(point.x,point.y);await page.waitForTimeout(30);
    assert.equal(messages.filter(m=>m.type==='link').length,count+1);assert.equal(messages.filter(m=>m.type==='link').at(-1).uri,uri);
   }
  };
  await checkPiLinks();
  const before=await page.evaluate(()=>window.__acks);session.setConnected(false);session.setConnected(true);await new Promise(r=>session.snapshot(r));
  await page.waitForFunction(count=>window.__acks>count,before);await checkPiLinks();
  console.log(`PASS: ${platform}: real pi renderer #822 and both hard-wrapped URL segments preserve full target, live and replayed.`);
 }
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
 // Exercise the production host snapshot, rather than inserting mouse modes into a synthetic snapshot.
 for(const alternate of [false,true])for(const tracking of [1000,1002,1003])for(const encoding of [0,1006,1016]){
  const marker=`MOUSE_${alternate}_${tracking}_${encoding}`;
  session.write(`printf '\\033c${alternate?'\\033[?1049h':''}${marker}\\033[?${tracking}h${encoding?`\\033[?${encoding}h`:''}'\r`);
  await page.waitForFunction(marker=>document.querySelector('.xterm-rows').textContent.startsWith(marker),marker);
  for(let replay=0;replay<2;replay++){
   if(replay){
    const before=await page.evaluate(()=>window.__acks);
    session.setConnected(false);session.setConnected(true);await new Promise(done=>session.snapshot(done));
    await page.waitForFunction(count=>window.__acks>count,before);
   }
   const start=await cell(2,0);await page.mouse.move(start.x,start.y);const from=messages.length;
   await page.mouse.click(start.x,start.y);await page.mouse.wheel(0,120);
   await page.waitForTimeout(30);
   const reports=messages.slice(from).filter(m=>m.type==='input');
   assert.ok(reports.some(m=>encoding?/^\x1b\[<0;.*M$/.test(m.data):m.data.startsWith('\x1b[M ')),`${marker}: click reaches CLI ${replay?'after replay':'live'}`);
   assert.ok(reports.some(m=>encoding?/^\x1b\[<0;.*m$/.test(m.data):m.data.startsWith('\x1b[M#')),`${marker}: release reaches CLI ${replay?'after replay':'live'}`);
   assert.ok(reports.some(m=>encoding?/^\x1b\[<65;/.test(m.data):m.data.startsWith('\x1b[Ma')),`${marker}: wheel reaches CLI ${replay?'after replay':'live'}`);
   if(!encoding)assert.ok(reports.every(m=>m.binary===true),'legacy mouse reports use the binary PTY path');
  }
 }
 // SGR supports columns beyond the 223-column legacy limit after restoration.
 await page.setViewportSize({width:2500,height:740});
 await page.waitForFunction(()=>document.querySelector('.xterm-screen').getBoundingClientRect().width>2300);
 for(const encoding of [0,1006]){
  session.write(`printf '\\033c\\033[?1049hWIDE_MOUSE_${encoding}\\033[?1000h${encoding?'\\033[?1006h':''}'\r`);
  await page.waitForFunction(encoding=>document.querySelector('.xterm-rows').textContent.startsWith(`WIDE_MOUSE_${encoding}`),encoding);
  const before=await page.evaluate(()=>window.__acks);session.setConnected(false);session.setConnected(true);
  await new Promise(done=>session.snapshot(done));await page.waitForFunction(count=>window.__acks>count,before);
  const x=encoding?230:110,p=await cell(x,0),from=messages.length;
  await page.mouse.click(p.x,p.y);await page.waitForTimeout(30);
  const report=messages.slice(from).find(m=>m.type==='input');assert.ok(report,'wide-grid click reaches CLI after replay');
  if(encoding)assert.equal(report.data,'\x1b[<0;231;1M');
  else{assert.equal(report.binary,true);assert.equal(report.data,'\x1b[M '+String.fromCharCode(143)+'!');}
 }
 const beforeBrowserQueries=messages.length;
 await display('\x1b[?1004h\x1b]11;?\x07\x1b[6n');
 const browserReplies=messages.slice(beforeBrowserQueries).filter(message=>message.type==='input');
 assert.ok(browserReplies.some(message=>/^\x1b\]11;rgb:/.test(message.data)),'browser still answers theme color queries');
 assert.ok(browserReplies.some(message=>/^\x1b\[[IO]$/.test(message.data)),'browser still reports focus');
 assert.ok(!browserReplies.some(message=>/^\x1b\[\d+;\d+R$/.test(message.data)),'browser never duplicates host cursor replies');
 await page.setViewportSize({width:420,height:740});
 await page.waitForFunction(()=>document.querySelector('.xterm-screen').getBoundingClientRect().width<500);
 interactionFixture=false;
 const shellQuote=value=>"'"+value.replaceAll("'","'\\''")+"'";
 session.write(`${shellQuote(process.execPath)} ${shellQuote(path.join(__dirname,'tui-recovery.cjs'))}\r`);
 await page.waitForFunction(()=>document.querySelector('.xterm-rows').textContent.startsWith('QUERY=1 CLICK=0 WHEEL=0'));
 for(let iteration=1;iteration<=3;iteration++){
  session.setConnected(false);
  await new Promise((done,reject)=>{
   const timeout=setTimeout(()=>{subscription.dispose();reject(new Error('hidden TUI query timed out'));},5000);
   const subscription=session.mirror.onWriteParsed(()=>{
    if(session.mirror.buffer.active.getLine(0).translateToString(true).startsWith(`QUERY=${iteration+1}`)){
     clearTimeout(timeout);subscription.dispose();done();
    }
   });
   session.write('?');
  });
  session.setConnected(true);
  const before=await page.evaluate(()=>window.__acks);
  await new Promise(done=>session.snapshot(done));
  await page.waitForFunction(count=>window.__acks>count,before);
  const footer=await cell(2,5);await page.mouse.click(footer.x,footer.y);
  const body=await cell(2,3);await page.mouse.move(body.x,body.y);await page.mouse.wheel(0,120);
  await page.waitForFunction(iteration=>document.querySelector('.xterm-rows').textContent.startsWith(`QUERY=${iteration+1} CLICK=${iteration} WHEEL=${iteration}`),iteration);
  assert.equal((await visibleRows.nth(5).textContent()).trimEnd(),'CLICK_ME','the visible button stays in the scrolling TUI footer');
  assert.equal((await visibleRows.nth(4).textContent()).trimEnd(),`SCROLL_${iteration}`,'wheel input causes the CLI to scroll its region');
 }
 await page.keyboard.press('q');
 await page.waitForFunction(()=>!document.querySelector('.xterm').classList.contains('enable-mouse-events'));
 assert.deepEqual(errors,[]);console.log(`PASS: ${platform}: Chromium UI + real PTY, links, selection/copy, mouse modes, queries, and interactive TUI clicks/scrolling across reconnects, no JS errors.`);
 }finally{session?.dispose();await page.close();}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
