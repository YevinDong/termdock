const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const p = require('../package.json');

test('Termlet author, publisher and original 256px icon are present', () => {
  assert.equal(p.author, 'yevin');
  assert.equal(p.publisher, 'yevin');
  assert.equal(p.name, 'termlet');
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

const mdLinks = text => [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(m => m[1]);

test('English README is the default and links to the Chinese README', () => {
  const readme = fs.readFileSync('README.md', 'utf8');
  // vsce rewrites relative links against the repository; without it, packaging fails.
  assert.equal(p.repository.url, 'https://github.com/YevinDong/termlet.git');
  assert.deepEqual(mdLinks(readme), ['README.zh-CN.md']);
  assert.doesNotMatch(readme, /<a id=|#readme-/, 'no in-page language anchors');
  assert.doesNotMatch(readme.replace('[简体中文](README.zh-CN.md)', ''), /[\u4e00-\u9fff]/, 'English only');
  assert.ok(readme.startsWith('# Termlet\n'));
  assert.match(readme, /The macOS\/Windows VS Code UI and complete remote workflows have not yet been tested/);
});

test('Chinese README is standalone and links back to the English README', () => {
  const readme = fs.readFileSync('README.zh-CN.md', 'utf8');
  assert.deepEqual(mdLinks(readme), ['README.md']);
  assert.doesNotMatch(readme, /<a id=|#readme-/);
  assert.ok(readme.startsWith('# Termlet · 简体中文\n'));
  assert.match(readme, /尚未实测 macOS\/Windows/);
});

test('both READMEs exist for every link target', () => {
  for (const file of ['README.md', 'README.zh-CN.md']) {
    for (const link of mdLinks(fs.readFileSync(file, 'utf8'))) assert.ok(fs.existsSync(link), `${file} -> ${link}`);
  }
});
