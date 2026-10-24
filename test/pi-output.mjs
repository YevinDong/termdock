// Optional integration fixture: use an installed pi-tui, without adding it as a project dependency.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.env.PI_TUI_PATH) throw new Error('Set PI_TUI_PATH to the installed pi-tui package directory.');
const moduleUrl = file => pathToFileURL(resolve(process.env.PI_TUI_PATH, 'dist', file)).href;
const { Markdown } = await import(moduleUrl('components/markdown.js'));
const { getCapabilities } = await import(moduleUrl('terminal-image.js'));
const theme = Object.fromEntries('heading link linkUrl code codeBlock codeBlockBorder quote quoteBorder hr listBullet bold italic strikethrough underline'.split(' ').map(key => [key, text => text]));
theme.underline = text => `\x1b[4m${text}\x1b[24m`;
const uri = 'https://github.com/Qiyin-Tech/orchestra-backend/pull/822';
const markdown = `已创建到 \`dev\` 的 PR：[#822](${uri})。\n\n链接：${uri}\n\nCI 正在运行；未进行真实 OSS 验证。`;
const lines = new Markdown(markdown, 0, 0, theme).render(process.stdout.columns || 40);
process.stdout.write('\x1b[2J\x1b[H');
for (const line of lines) process.stdout.write(line + '\x1b[0m\x1b]8;;\x1b\\\r\n');
process.stdout.write(`PI_LINKS=${getCapabilities().hyperlinks}\r\nPI_RENDER_DONE\r\n`);
