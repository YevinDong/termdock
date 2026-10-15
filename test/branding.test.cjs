const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const p = require('../package.json');

test('Termlet author and original 256px icon are present without changing upgrade identity', () => {
  assert.equal(p.author, 'yevin');
  assert.equal(p.publisher, 'dot-local');
  assert.equal(p.name, 'independent-sidebar-terminal');
  assert.equal(p.icon, 'media/icon.png');
  const png = fs.readFileSync(p.icon);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 256);
  assert.equal(png.readUInt32BE(20), 256);
  assert.equal(png[25], 6, 'RGBA image');
  const svg = fs.readFileSync('media/icon.svg', 'utf8');
  assert.match(svg, /<title>Termlet<\/title>/);
  assert.doesNotMatch(svg, /<script|<image|<foreignObject|href=/i);
  assert.match(fs.readFileSync('LICENSE', 'utf8'), /Copyright \(c\) 2026 yevin/);
});

test('default README has working offline language anchors and no external or relative-file links', () => {
  const readme = fs.readFileSync('README.md', 'utf8');
  const anchors = [...readme.matchAll(/<a id="([^"]+)"><\/a>/g)].map(m => m[1]);
  assert.deepEqual(anchors, ['readme-en', 'readme-zh-cn']);
  const links = [...readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(m => m[1]);
  assert.deepEqual(links, ['#readme-zh-cn', '#readme-en']);
  for (const link of links) assert.ok(anchors.includes(link.slice(1)));
  assert.ok(readme.indexOf('## What you get') < readme.indexOf('## 核心功能'));
  assert.match(readme, /By \*\*yevin\*\*/);
  assert.match(readme, new RegExp(`termlet-${p.version.replaceAll('.', '\\.')}\\.vsix`));
  assert.equal(p.repository, undefined, 'do not invent a repository URL');
});

test('standalone Chinese README matches the installed Chinese section and links to the English source', () => {
  const main = fs.readFileSync('README.md', 'utf8');
  const standalone = fs.readFileSync('README.zh-CN.md', 'utf8');
  const expected = main.split('<a id="readme-zh-cn"></a>\n')[1].trimStart()
    .replace('[English ↑](#readme-en)', '[English](README.md#readme-en)');
  assert.equal(standalone, expected);
  assert.ok(fs.existsSync('README.md'));
  assert.match(main, /Live macOS\/Windows UI and end-to-end remote behavior have not been verified/);
  assert.match(standalone, /尚未实测 macOS\/Windows/);
});
