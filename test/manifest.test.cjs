const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const p=require('../package.json');
test('Termlet upgrade preserves extension/view/settings identity and contributes native controls',()=>{
 assert.equal(p.name,'independent-sidebar-terminal');assert.equal(p.publisher,'dot-local');assert.equal(p.version,'0.2.1');assert.equal(p.displayName,'Termlet');assert.equal(p.engines.vscode,'^1.106.0');
 assert.equal(p.contributes.viewsContainers.secondarySidebar[0].id,'sidebarTerminal');assert.equal(p.contributes.viewsContainers.secondarySidebar[0].title,'Termlet');assert.equal(p.contributes.views.sidebarTerminal[0].id,'sidebarTerminal.terminal');assert.equal(p.contributes.views.sidebarTerminal[0].name,'Termlet');
 for(const setting of Object.keys(p.contributes.configuration.properties))assert.ok(setting.startsWith('sidebarTerminal.'));
 const title=p.contributes.menus['view/title'];for(const name of ['switch','new','kill'])assert.ok(title.some(m=>m.command==='sidebarTerminal.'+name&&m.group.startsWith('navigation')));
 for(const name of ['clear','restart','copy','paste','settings'])assert.ok(title.some(m=>m.command==='sidebarTerminal.'+name&&!m.group.startsWith('navigation')));
 for(const command of p.contributes.commands)assert.ok(command.title.startsWith('Termlet: '));
 const css=fs.readFileSync('media/style.css','utf8');assert.doesNotMatch(css,/#toolbar|#sessions|footer|#host|#status/);
 const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));assert.equal(lock.version,p.version);assert.equal(lock.packages[''].version,p.version);
});
