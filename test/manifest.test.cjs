const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const p=require('../package.json');
test('Termdock view/settings identity and contributes native controls',()=>{
 assert.equal(p.name,'termdock');assert.equal(p.publisher,'yevin');assert.equal(p.version,'0.3.0');assert.equal(p.displayName,'Termdock');assert.equal(p.engines.vscode,'^1.106.0');
 assert.equal(p.contributes.viewsContainers.secondarySidebar[0].id,'termdock');assert.equal(p.contributes.viewsContainers.secondarySidebar[0].title,'Termdock');assert.equal(p.contributes.views.termdock[0].id,'termdock.terminal');assert.equal(p.contributes.views.termdock[0].name,'Termdock');
 for(const setting of Object.keys(p.contributes.configuration.properties))assert.ok(setting.startsWith('termdock.'));
 const title=p.contributes.menus['view/title'];for(const name of ['switch','new','kill'])assert.ok(title.some(m=>m.command==='termdock.'+name&&m.group.startsWith('navigation')));
 for(const name of ['clear','restart','copy','paste','settings'])assert.ok(title.some(m=>m.command==='termdock.'+name&&!m.group.startsWith('navigation')));
 for(const command of p.contributes.commands)assert.ok(command.title.startsWith('Termdock: '));
 const css=fs.readFileSync('media/style.css','utf8');assert.doesNotMatch(css,/#toolbar|#sessions|footer|#host|#status/);
 const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));assert.equal(lock.version,p.version);assert.equal(lock.packages[''].version,p.version);
});
