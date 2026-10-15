const test=require('node:test');const assert=require('node:assert/strict');
const {dimension,resolveCwd,shellConfig,shellEnvironment,pasteRisk,isWebLink}=require('../dist/core');
test('dimensions reject invalid and bound excessive values',()=>{
 assert.equal(dimension(NaN,80,500),80);assert.equal(dimension(Infinity,80,500),80);assert.equal(dimension(-3,80,500),2);assert.equal(dimension(99999,80,500),500);assert.equal(dimension(42.7,80,500),42);assert.equal(dimension('80',24,300),24);
});
test('cwd substitutions and safe fallbacks',()=>{
 assert.equal(resolveCwd('', '/work', '/home/user'),'/work');assert.equal(resolveCwd('',undefined,'/home/user'),'/home/user');assert.equal(resolveCwd('${workspaceFolder}/src','/work','/home/user'),'/work/src');assert.equal(resolveCwd('~/src','/work','/home/user'),'/home/user/src');assert.equal(resolveCwd('src','/work','/home/user'),'/work/src');
});
test('shell selection and explicit argument preservation',()=>{
 assert.deepEqual(shellConfig('darwin','',null,{SHELL:'/bin/zsh'}),{executable:'/bin/zsh',args:['-l']});assert.deepEqual(shellConfig('darwin','/bin/bash',[],{}),{executable:'/bin/bash',args:[]});assert.equal(shellConfig('win32','',null,{}).executable,'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');assert.equal(shellConfig('win32','',null,{SystemRoot:'D:\\Win'}).executable,'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');assert.equal(shellConfig('linux','',null,{}).executable,'/bin/sh');
});
test('environment sanitizes Electron launch but retains remote code CLI',()=>{
 const env=shellEnvironment({PATH:'/bin',NODE_OPTIONS:'--inspect',ELECTRON_RUN_AS_NODE:'1',VSCODE_IPC_HOOK_CLI:'/socket',VSCODE_CLI_REQUIRE_TOKEN:'1',VSCODE_AMD_ENTRYPOINT:'bad'});
 assert.equal(env.PATH,'/bin');assert.equal(env.NODE_OPTIONS,undefined);assert.equal(env.ELECTRON_RUN_AS_NODE,undefined);assert.equal(env.VSCODE_AMD_ENTRYPOINT,undefined);assert.equal(env.VSCODE_IPC_HOOK_CLI,'/socket');assert.equal(env.TERM,'xterm-256color');
});
test('paste risk flags line breaks and other control characters',()=>{
 assert.equal(pasteRisk('echo ok'),undefined);assert.equal(pasteRisk('a\tb'),undefined);assert.equal(pasteRisk('中文 ✓'),undefined);
 assert.equal(pasteRisk('a\nb'),'multiline');assert.equal(pasteRisk('a\r'),'multiline');
 for(const c of ['\x0f','\x1b[201~','\x03','\x7f','\x9b','\x00'])assert.equal(pasteRisk('rm -rf ~'+c),'control',JSON.stringify(c));
});
test('only http and https terminal links may be opened',()=>{
 assert.equal(isWebLink('https://example.com/a?b=1'),true);assert.equal(isWebLink('http://localhost:3000'),true);
 for(const v of ['file:///etc/passwd','command:workbench.action.terminal.new','vscode://x','javascript:alert(1)','not a url','',42,undefined,'https://'+'a'.repeat(9000)])assert.equal(isWebLink(v),false,String(v).slice(0,40));
});
