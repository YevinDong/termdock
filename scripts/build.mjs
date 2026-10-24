import { build } from 'esbuild';
import { mkdir, cp, rm, readFile, writeFile, chmod } from 'node:fs/promises';
import { serializeLinks } from './serialize-links.mjs';
const serializerBuild = {plugins:[serializeLinks],tsconfigRaw:{compilerOptions:{experimentalDecorators:true}}};
await mkdir('dist', {recursive:true});
await build({...serializerBuild,entryPoints:['src/extension.ts'],bundle:true,platform:'node',format:'cjs',target:'node20',outfile:'dist/extension.js',external:['vscode','./vendor/pty'],sourcemap:false});
await build({entryPoints:['webview/main.ts'],bundle:true,platform:'browser',format:'iife',target:'es2022',outfile:'dist/webview.js',minify:true});
await build({entryPoints:['src/core.ts'],bundle:true,platform:'node',format:'cjs',target:'node20',outfile:'dist/core.js'});
await build({...serializerBuild,entryPoints:['src/session.ts'],bundle:true,platform:'node',format:'cjs',target:'node20',outfile:'dist/session.js'});
await cp('node_modules/@xterm/xterm/css/xterm.css','dist/xterm.css');
await rm('dist/vendor',{recursive:true,force:true});
await mkdir('dist/vendor/pty',{recursive:true});
for (const item of ['lib','prebuilds','package.json','LICENSE']) {
  await cp(`node_modules/node-pty/${item}`,`dist/vendor/pty/${item}`,{recursive:true,filter:src=>!src.endsWith('.pdb')&&!src.endsWith('.map')});
}
for (const arch of ['arm64','x64']) await chmod(`dist/vendor/pty/prebuilds/darwin-${arch}/spawn-helper`,0o755);
const licenses = await Promise.all(['node-pty','@xterm/xterm','@xterm/addon-fit','@xterm/addon-web-links','@xterm/addon-serialize','@xterm/headless'].map(async p=>`\n===== ${p} =====\n${await readFile(`node_modules/${p}/LICENSE`,'utf8').catch(()=>readFile('node_modules/@xterm/xterm/LICENSE','utf8'))}`));
await writeFile('THIRD_PARTY_NOTICES.txt',licenses.join('\n'));
console.log('Built extension, webview and all six native PTY targets.');
