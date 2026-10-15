const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const pty=require('../dist/vendor/pty');
test('shipped Linux x64 PTY is a real TTY; input, resize, Unicode, exit work',{timeout:10000},async()=>{
 const p=pty.spawn('/bin/sh',['-i'],{name:'xterm-256color',cols:80,rows:24,cwd:'/tmp',env:{...process.env,TERM:'xterm-256color'}});let out='';p.onData(s=>out+=s);
 const wait=async match=>{const until=Date.now()+5000;while(!match.test(out)){if(Date.now()>until)throw new Error(`PTY timeout: ${out}`);await new Promise(r=>setTimeout(r,20));}};
 try{p.write("test -t 0 && printf 'REAL_%s\\n' TTY\r");await wait(/REAL_TTY/);p.resize(103,31);p.write("stty size; printf 'UNICODE_%s\\n' 你好\r");await wait(/31 103/);await wait(/UNICODE_你好/);const exit=new Promise(r=>p.onExit(r));p.write('exit 7\r');assert.equal((await exit).exitCode,7);}finally{try{p.kill()}catch{}}
});
test('all supported native targets and Windows worker resources are shipped',()=>{
 for(const target of ['darwin-arm64','darwin-x64','linux-arm64','linux-x64','win32-arm64','win32-x64']){
  const file=target.startsWith('win32')?'conpty.node':'pty.node';assert.ok(fs.statSync(path.join(__dirname,'../dist/vendor/pty/prebuilds',target,file)).size>1000);
 }
 for(const arch of ['arm64','x64'])assert.ok(fs.statSync(path.join(__dirname,`../dist/vendor/pty/prebuilds/darwin-${arch}/spawn-helper`)).mode&0o111);
 assert.ok(fs.existsSync(path.join(__dirname,'../dist/vendor/pty/lib/worker/conoutSocketWorker.js')));
});
