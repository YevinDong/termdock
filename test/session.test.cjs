const test=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const {Session}=require('../dist/session');
class Fake extends EventEmitter{
 cols=80;rows=24;paused=false;killed=false;input='';
 onData(cb){this.on('data',cb);return {dispose:()=>this.off('data',cb)}}
 onExit(cb){this.on('exit',cb);return {dispose:()=>this.off('exit',cb)}}
 write(s){this.input+=s;}resize(c,r){this.cols=c;this.rows=r;}pause(){this.paused=true}resume(){this.paused=false}kill(){this.killed=true}
}
const {Terminal}=require('@xterm/headless');
const write=(term,data)=>new Promise(r=>term.write(data,r));
function linkCells(term){
 const cells=[];
 for(const buffer of [term.buffer.normal,term.buffer.alternate])for(let y=0;y<buffer.length;y++)for(let x=0;x<term.cols;x++){
  const cell=buffer.getLine(y).getCell(x);const uri=term._core._oscLinkService.getLinkData(cell.extended.urlId)?.uri;
  if(uri)cells.push({buffer:buffer.type,x,y,text:cell.getChars(),uri});
 }
 return cells;
}
const tick=()=>new Promise(r=>setTimeout(r,40));
function fixture(cols=80,rows=24){const p=new Fake;p.cols=cols;p.rows=rows;const messages=[];const s=new Session('id','sh 1','/tmp',p,100,m=>messages.push(m),()=>{});return {p,s,messages};}
test('headless snapshot replays ANSI and Unicode and live output remains ordered',async()=>{
 const {p,s,messages}=fixture();s.setConnected(true);p.emit('data','first\r\n\x1b[32m你好 terminal\x1b[0m');await new Promise(r=>s.snapshot(r));
 const snap=messages.find(m=>m.type==='snapshot');assert.ok(snap);assert.match(snap.data,/你好 terminal/);assert.equal(snap.seq,1);
 p.emit('data','\r\nafter');await tick();assert.ok(messages.some(m=>m.type==='data'&&m.seq===2&&m.data.includes('after')));s.dispose();
});
test('snapshots preserve OSC 8 labels, wrapped/Unicode/scrollback links and open-link continuation',async()=>{
 for(const alternate of [false,true]){
  const {p,s,messages}=fixture(12,4);
  const restored=new Terminal({allowProposedApi:true,cols:12,rows:4,scrollback:100});
  const a='https://example.org/a',b='https://example.org/b';
  const link=(uri,label)=>`\x1b]8;;${uri}\x1b\\${label}\x1b]8;;\x1b\\`;
  try{
   p.emit('data',`${link(a,'URL')} plain ${link(b,'URL')}\r\n${link(a,'你好 e\u0301 '+ 'wrapped'.repeat(4))}\r\nlast\r\n`);
   if(alternate)p.emit('data',`\x1b[?1049h${link(b,'alternate URL')}\r\n`);
   p.emit('data',`\x1b]8;id=continuing;${a}\x1b\\OPEN`);
   s.setConnected(true);await new Promise(r=>s.snapshot(r));
   const snapshot=messages.filter(m=>m.type==='snapshot').at(-1);assert.ok(snapshot.data.includes(a));assert.ok(snapshot.data.includes(b));
   await write(restored,'\x1bc'+snapshot.data);assert.deepEqual(linkCells(restored),linkCells(s.mirror));
   p.emit('data','_TAIL\x1b]8;;\x1b\\ plain');await write(s.mirror,'');await write(restored,'_TAIL\x1b]8;;\x1b\\ plain');
   assert.deepEqual(linkCells(restored),linkCells(s.mirror),'active OSC 8 state survives snapshot cutoff');
   assert.ok(linkCells(restored).some(c=>c.text==='T'&&c.uri===a));
  }finally{s.dispose();restored.dispose();}
 }
});
test('renderer ACK backpressure and disconnect resume a shell',async()=>{
 const {p,s}=fixture();s.setConnected(true);p.emit('data','x'.repeat(300000));await tick();await tick();assert.equal(p.paused,true);s.ack(1);await tick();assert.equal(p.paused,false);
 p.emit('data','z'.repeat(300000));await tick();assert.equal(p.paused,true);s.setConnected(false);await tick();assert.equal(p.paused,false);s.dispose();
});
test('disconnected output still gets replayed, exited shell retained, close kills running shell',async()=>{
 const {p,s,messages}=fixture();p.emit('data','retained');await tick();assert.equal(messages.length,0);s.setConnected(true);await new Promise(r=>s.snapshot(r));assert.match(messages.find(m=>m.type==='snapshot').data,/retained/);
 s.write('ls\r');assert.equal(p.input,'ls\r');s.resize(100,30);assert.equal(p.cols,100);p.emit('exit',{exitCode:3});assert.equal(s.info().exitCode,3);assert.equal(s.info().running,false);s.write('ignored');assert.equal(p.input,'ls\r');s.dispose();
 const f=fixture();f.s.dispose();assert.equal(f.p.killed,true);f.s.dispose();
});
