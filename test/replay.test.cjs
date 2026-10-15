const test=require('node:test');const assert=require('node:assert/strict');const {Terminal}=require('@xterm/headless');const {SerializeAddon}=require('@xterm/addon-serialize');
const write=(term,s)=>new Promise(r=>term.write(s,r));
test('queued RIS snapshot reset cannot duplicate earlier in-flight renderer data',async()=>{
 const source=new Terminal({allowProposedApi:true,cols:40,rows:10});const ser=new SerializeAddon;source.loadAddon(ser);await write(source,'hello\r\nworld');
 const renderer=new Terminal({allowProposedApi:true,cols:40,rows:10});renderer.write('hello\r\nworld');await write(renderer,'\x1bc'+ser.serialize());
 assert.equal(renderer.buffer.active.getLine(0).translateToString(true),'hello');assert.equal(renderer.buffer.active.getLine(1).translateToString(true),'world');assert.equal(renderer.buffer.active.getLine(2).translateToString(true),'');source.dispose();renderer.dispose();
});
