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
test('Unicode 15 graphemes keep their cells at a wrap boundary and through replay', async () => {
 const {p,s,messages}=fixture(12,4);
 try {
  assert.equal(s.mirror.unicode.activeVersion,'15-graphemes');
  s.setConnected(true);
  p.emit('data','1234567890𰀀👩‍💻好');
  await new Promise(done=>s.snapshot(done));
  const first=s.mirror.buffer.active.getLine(0);
  const second=s.mirror.buffer.active.getLine(1);
  assert.equal(first.getCell(10).getChars(),'𰀀');
  assert.equal(first.getCell(10).getWidth(),2);
  assert.equal(second.isWrapped,true);
  assert.equal(second.getCell(0).getChars(),'👩‍💻');
  assert.equal(second.getCell(0).getWidth(),2);
  assert.equal(second.getCell(2).getChars(),'好');
  const snapshot=messages.find(message=>message.type==='snapshot');
  const restored=fixture(snapshot.cols,snapshot.rows);
  try {
   await write(restored.s.mirror,'\x1bc'+snapshot.data);
   assert.equal(restored.s.serializer.serialize(),s.serializer.serialize());
   assert.equal(restored.s.mirror.buffer.active.getLine(1).getCell(2).getChars(),'好');
  } finally { restored.s.dispose(); }
 } finally { s.dispose(); }
});
test('snapshots and queued PTY output keep their dimensions across alternate-screen shrink', async () => {
 const {p,s,messages}=fixture(12,4);
 try {
  s.setConnected(true);
  p.emit('data','\x1b[?1049h123456789好X\r\n012345678912');
  const snapshotDone=new Promise(done=>s.snapshot(done));
  p.emit('data','\x1b[3;11H12');
  s.resize(10,4);
  p.emit('data','\x1b[4;1HNEW_SIZE12');
  await snapshotDone;
  await write(s.mirror,'');
  assert.deepEqual(messages.map(message=>message.type),['data','snapshot','data','resize','data']);
  assert.equal(messages[1].cols,12);
  assert.match(messages[1].data,/123456789好X/);
  assert.equal(messages[3].cols,10);
  const frame=s.mirror.buffer.active;
  const rows=Array.from({length:4},(_,row)=>frame.getLine(row));
  assert.deepEqual(rows.map(row=>row.length),[10,10,10,10]);
  assert.deepEqual(rows.map(row=>row.translateToString(true)),['123456789','0123456789','','NEW_SIZE12']);
  assert.equal(rows[0].getCell(9).getWidth(),1);
  await new Promise(done=>s.snapshot(done));
  const resized=messages.at(-1);
  assert.equal(resized.cols,10);
  assert.doesNotMatch(resized.data,/好|012345678912/);
 } finally { s.dispose(); }
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
