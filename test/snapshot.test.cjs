const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { Session } = require('../dist/session');
const { Terminal } = require('@xterm/headless');

const sources = new Map();
function loadSource(relativePath) {
  const filename = path.resolve(__dirname, '..', relativePath);
  if (sources.has(filename)) return sources.get(filename);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  });
  const sourceModule = { exports: {} };
  const load = name => name.startsWith('.') ? loadSource(path.resolve(path.dirname(filename), name + '.ts')) : require(name);
  vm.runInNewContext(outputText, { require: load, module: sourceModule, exports: sourceModule.exports }, { filename });
  sources.set(filename, sourceModule.exports);
  return sourceModule.exports;
}
const { restoreSnapshotState } = loadSource('src/snapshot.ts');
const { configureTerminal, resizeTerminal } = loadSource('src/terminal.ts');
const { useHostQueryResponses } = loadSource('webview/queries.ts');

class ReviewPty extends EventEmitter {
  cols = 20;
  rows = 6;
  input = [];
  onData(callback) {
    this.on('data', callback);
    return { dispose: () => this.off('data', callback) };
  }
  onExit(callback) {
    this.on('exit', callback);
    return { dispose: () => this.off('exit', callback) };
  }
  write(data) { this.input.push(data); }
  resize(cols, rows) { this.cols = cols; this.rows = rows; }
  pause() {}
  resume() {}
  kill() { this.emit('exit', { exitCode: 0 }); }
}

const write = (terminal, data) => new Promise(done => terminal.write(data, done));
const rows = terminal => Array.from({ length: terminal.rows }, (_, index) =>
  terminal.buffer.active.getLine(terminal.buffer.active.baseY + index).translateToString(true));

function fixture(cols = 20, rows = 6) {
  const pty = new ReviewPty();
  pty.resize(cols, rows);
  const messages = [];
  const session = new Session('review', 'sh', '/tmp', pty, 100,
    message => messages.push(message), () => {});
  const renderer = new Terminal({ allowProposedApi: true, cols: pty.cols, rows: pty.rows, scrollback: 100 });
  configureTerminal(renderer);
  useHostQueryResponses(renderer);
  renderer.onData(data => session.write(data));
  return { pty, session, renderer, messages };
}

async function replay(renderer, messages) {
  for (const message of messages) {
    if (message.type === 'snapshot') {
      await write(renderer, '\x1bc');
      resizeTerminal(renderer, message);
      await write(renderer, message.data);
      if (message.runtime) restoreSnapshotState(renderer, structuredClone(message.runtime));
    } else if (message.type === 'resize') resizeTerminal(renderer, message);
    else if (message.type === 'data') await write(renderer, message.data);
  }
}

const takeSnapshot = session => new Promise(done => session.snapshot(done));

test('narrow reconnect keeps wrapped rows and restores hidden wide graphemes and OSC 8 links on widen', async () => {
  const { pty, session, renderer, messages } = fixture(12, 4);
  const url = 'https://example.org/hidden';
  try {
    pty.emit('data', `\x1b[?1049h123456789\x1b[31m\x1b]8;;${url}\x07👩‍💻\x1b]8;;\x07\x1b[0mXabcdefghijklm`);
    await write(session.mirror, '');
    const wide = ['123456789👩‍💻X', 'abcdefghijkl', 'm', ''];
    assert.deepEqual(rows(session.mirror), wide);
    session.resize(10, 4);
    await write(session.mirror, '');
    session.setConnected(true);
    await takeSnapshot(session);
    const narrow = ['123456789', 'abcdefghij', 'm', ''];
    const snapshot = messages.at(-1);
    assert.equal(snapshot.cols, 10);
    assert.doesNotMatch(snapshot.data.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, ''), /👩‍💻|X|abcdefghijkl/);
    await replay(renderer, [snapshot]);
    const both = [session.mirror, renderer];
    for (const terminal of both) {
      assert.deepEqual(rows(terminal), narrow);
      const buffer = terminal.buffer.active;
      assert.equal(buffer.getLine(0).getCell(9).getWidth(), 1);
      assert.equal(buffer.getLine(1).isWrapped, true);
      assert.equal(buffer.getLine(2).isWrapped, true);
    }
    for (const cols of [8, 10, 11, 12]) {
      session.resize(cols, 4);
      await write(session.mirror, '');
      await replay(renderer, [messages.at(-1)]);
      assert.deepEqual(rows(renderer), rows(session.mirror));
    }
    for (const terminal of both) {
      assert.deepEqual(rows(terminal), wide);
      const line = terminal.buffer.active.getLine(0);
      const grapheme = line.getCell(9);
      assert.equal(grapheme.getWidth(), 2);
      assert.equal(line.getCell(10).getWidth(), 0);
      assert.equal(grapheme.getFgColor(), 1);
      assert.equal(terminal._core._oscLinkService.getLinkData(grapheme.extended.urlId)?.uri, url);
    }
  } finally { session.dispose(); renderer.dispose(); }
});

for (const [name, clear] of [['entire line', '\x1b[2K'], ['to end of line', '\x1b[K'], ['display', '\x1b[2J'], ['to end of display', '\x1b[J']]) {
  test(`erasing ${name} while narrow discards hidden cells live and after reconnect`, async () => {
    const { pty, session, renderer, messages } = fixture(12, 4);
    try {
      pty.emit('data', '\x1b[?1049hABCDEFGHIJKL');
      session.resize(10, 4);
      session.setConnected(true);
      await takeSnapshot(session);
      await replay(renderer, [messages.at(-1)]);
      messages.length = 0;
      pty.emit('data', `\r${clear}NEW`);
      session.resize(12, 4);
      await write(session.mirror, '');
      await replay(renderer, messages);
      assert.deepEqual(rows(session.mirror), ['NEW', '', '', '']);
      assert.deepEqual(rows(renderer), rows(session.mirror));
    } finally { session.dispose(); renderer.dispose(); }
  });
}

for (const [name, sequence, expected] of [
  ['erase to the left', '\x1b[1;10H\x1b[1K', ['          KL', '0123456789WX', '', '']],
  ['erase a fixed count up to the right edge', '\x1b[1;7H\x1b[4X', ['ABCDEF    KL', '0123456789WX', '', '']],
  ['erase a fixed count past the right edge', '\x1b[1;7H\x1b[20X', ['ABCDEF    KL', '0123456789WX', '', '']],
  ['erase the display above the cursor', '\x1b[2;10H\x1b[1J', ['', '          WX', '', '']],
]) {
  test(`${name} keeps unrelated hidden cells live and after reconnect`, async () => {
    const { pty, session, renderer, messages } = fixture(12, 4);
    try {
      pty.emit('data', '\x1b[?1049hABCDEFGHIJKL\r\n0123456789WX');
      session.resize(10, 4);
      session.setConnected(true);
      await takeSnapshot(session);
      await replay(renderer, [messages.at(-1)]);
      messages.length = 0;
      pty.emit('data', sequence);
      session.resize(12, 4);
      await write(session.mirror, '');
      await replay(renderer, messages);
      assert.deepEqual(rows(session.mirror), expected);
      assert.deepEqual(rows(renderer), expected);
    } finally { session.dispose(); renderer.dispose(); }
  });
}

test('selective erase keeps a protected split glyph but clears unprotected hidden cells', async () => {
  const { pty, session, renderer, messages } = fixture(12, 4);
  try {
    pty.emit('data', '\x1b[?1049h123456789\x1b[1"q好\x1b[0"qX');
    session.resize(10, 4);
    session.setConnected(true);
    await takeSnapshot(session);
    await replay(renderer, [messages.at(-1)]);
    messages.length = 0;
    pty.emit('data', '\r\x1b[?2K');
    session.resize(12, 4);
    await write(session.mirror, '');
    await replay(renderer, messages);
    for (const terminal of [session.mirror, renderer]) {
      assert.deepEqual(rows(terminal), ['         好', '', '', '']);
      assert.equal(terminal.buffer.active.getLine(0).getCell(10).getWidth(), 0);
    }
  } finally { session.dispose(); renderer.dispose(); }
});

test('overwriting a split cell does not resurrect either half on widen', async () => {
  const { pty, session, renderer, messages } = fixture(12, 4);
  try {
    pty.emit('data', '\x1b[?1049h123456789好X');
    session.resize(10, 4);
    session.setConnected(true);
    await takeSnapshot(session);
    await replay(renderer, [messages.at(-1)]);
    messages.length = 0;
    pty.emit('data', '\x1b[1;10HQ');
    session.resize(12, 4);
    await write(session.mirror, '');
    await replay(renderer, messages);
    assert.deepEqual(rows(session.mirror), ['123456789Q X', '', '', '']);
    assert.deepEqual(rows(renderer), rows(session.mirror));
    assert.equal(renderer.buffer.active.getLine(0).getCell(10).getWidth(), 1);
  } finally { session.dispose(); renderer.dispose(); }
});

test('alternate screen scroll moves hidden cells with the row and does not restore a recycled row', async () => {
  const { pty, session, renderer, messages } = fixture(12, 3);
  try {
    pty.emit('data', '\x1b[?1049h1234567890AA\r\nabcdefghijBB\r\nABCDEFGHIJCC');
    session.resize(10, 3);
    pty.emit('data', '\r\nEND');
    session.setConnected(true);
    await takeSnapshot(session);
    await replay(renderer, [messages.at(-1)]);
    session.resize(12, 3);
    await write(session.mirror, '');
    await replay(renderer, [messages.at(-1)]);
    assert.deepEqual(rows(session.mirror), ['abcdefghijBB', 'ABCDEFGHIJCC', 'END']);
    assert.deepEqual(rows(renderer), rows(session.mirror));
  } finally { session.dispose(); renderer.dispose(); }
});

test('narrow replay preserves a wrapped top row after scrolling its predecessor away', async () => {
  const { pty, session, renderer, messages } = fixture(6, 3);
  try {
    pty.emit('data', '\x1b[?1049hABCDEFGHIJKLMNOPQRSTUVWXYZ');
    session.resize(4, 3);
    session.setConnected(true);
    await takeSnapshot(session);
    await replay(renderer, [messages.at(-1)]);
    assert.deepEqual(rows(renderer), ['MNOP', 'STUV', 'YZ']);
    for (const terminal of [renderer, session.mirror]) {
      const buffer = terminal.buffer.active;
      assert.deepEqual(Array.from({ length: 3 }, (_, row) => buffer.getLine(row).isWrapped), [true, true, true]);
    }
    session.resize(6, 3);
    await write(session.mirror, '');
    await replay(renderer, [messages.at(-1)]);
    assert.deepEqual(rows(renderer), ['MNOPQR', 'STUVWX', 'YZ']);
  } finally { session.dispose(); renderer.dispose(); }
});

for (const scenario of ['connected', 'hidden-stable', 'reconnect-before-parse', 'hide-before-flush', 'hide-after-flush']) {
  test(`terminal queries receive exactly one response across ${scenario}`, async () => {
    const { pty, session, renderer, messages } = fixture();
    try {
      if (['connected', 'hide-before-flush', 'hide-after-flush'].includes(scenario)) session.setConnected(true);
      pty.emit('data', '\x1b[?1006h\x1b[2;5r\x1b[4;3H' +
        '\x1b[6n\x1b[?6n\x1b[5n\x1b[c\x1b[>c\x1b[?1006$p\x1b[4$p\x1bP$qr\x1b\\');
      if (scenario === 'reconnect-before-parse') session.setConnected(true);
      await write(session.mirror, '');
      if (scenario === 'hide-after-flush') await new Promise(done => setTimeout(done, 30));
      if (scenario.startsWith('hide-')) session.setConnected(false);
      session.setConnected(true);
      await new Promise(done => session.snapshot(done));
      await replay(renderer, messages);
      assert.deepEqual(pty.input, [
        '\x1b[4;3R', '\x1b[?4;3R', '\x1b[0n', '\x1b[?1;2c', '\x1b[>0;276;0c',
        '\x1b[?1006;1$y', '\x1b[4;2$y', '\x1bP1$r2;5r\x1b\\'
      ]);
    } finally { session.dispose(); renderer.dispose(); }
  });
}

test('queries split across snapshot cutoffs are answered once after their terminator', async () => {
  for (const query of ['\x1b[6n', '\x1b[?1006$p', '\x1bP$qr\x1b\\']) {
    for (let split = 1; split < query.length; split++) {
      const { pty, session, renderer, messages } = fixture();
      try {
        pty.emit('data', query.slice(0, split));
        session.setConnected(true);
        await new Promise(done => session.snapshot(done));
        pty.emit('data', query.slice(split));
        await new Promise(done => session.snapshot(done));
        await replay(renderer, messages);
        assert.equal(pty.input.length, 1, `${JSON.stringify(query)} split at ${split}`);
      } finally { session.dispose(); renderer.dispose(); }
    }
  }
});

const layout = '\x1b[1;1HHEADER\x1b[2;1Hrow1\x1b[3;1Hrow2\x1b[4;1Hrow3' +
  '\x1b[5;1Hrow4\x1b[6;1HFOOTER\x1b[2;5r';

for (const alternate of [false, true]) {
  for (const origin of [false, true]) {
    test(`snapshot continues regional scrolling with origin=${origin}, alternate=${alternate}`, async () => {
      const { pty, session, renderer, messages } = fixture();
      try {
        pty.emit('data', `${alternate ? '\x1b[?1049h' : ''}${layout}${origin ? '\x1b[?6h\x1b[4;1H' : '\x1b[5;1H'}`);
        session.setConnected(true);
        await new Promise(done => session.snapshot(done));
        await replay(renderer, messages.filter(message => message.type === 'snapshot'));
        assert.deepEqual(rows(renderer), rows(session.mirror));
        assert.equal(renderer.buffer.active.cursorY, session.mirror.buffer.active.cursorY);
        pty.emit('data', '\r\nNEW');
        await write(session.mirror, '');
        await write(renderer, '\r\nNEW');
        assert.deepEqual(rows(renderer), ['HEADER', 'row2', 'row3', 'row4', 'NEW', 'FOOTER']);
        assert.deepEqual(rows(renderer), rows(session.mirror));
      } finally { session.dispose(); renderer.dispose(); }
    });
  }
}

test('snapshot preserves pending wrap at the bottom of a scrolling region', async () => {
  const { pty, session, renderer, messages } = fixture();
  try {
    pty.emit('data', '\x1b[?1049h' + layout + '\x1b[5;1H0123456789ABCDEFGHIJ');
    session.setConnected(true);
    await new Promise(done => session.snapshot(done));
    await replay(renderer, messages.filter(message => message.type === 'snapshot'));
    assert.equal(renderer.buffer.active.cursorX, renderer.cols);
    pty.emit('data', 'Z');
    await write(session.mirror, '');
    await write(renderer, 'Z');
    assert.deepEqual(rows(renderer), rows(session.mirror));
    assert.equal(rows(renderer)[4], 'Z');
    assert.equal(rows(renderer)[5], 'FOOTER');
  } finally { session.dispose(); renderer.dispose(); }
});

test('leaving the alternate screen restores normal margins and saved cursor attributes', async () => {
  const { pty, session, renderer, messages } = fixture();
  try {
    pty.emit('data', layout + '\x1b[5;1H\x1b[31m\x1b[?1049h\x1b[0mALT');
    session.setConnected(true);
    await new Promise(done => session.snapshot(done));
    await replay(renderer, messages.filter(message => message.type === 'snapshot'));
    const continuation = '\x1b[?1049l\r\nNEW';
    pty.emit('data', continuation);
    await write(session.mirror, '');
    await write(renderer, continuation);
    assert.deepEqual(rows(renderer), rows(session.mirror));
    assert.equal(rows(renderer)[4], 'NEW');
    assert.equal(rows(renderer)[5], 'FOOTER');
    assert.equal(renderer.buffer.active.getLine(4).getCell(0).getFgColor(), 1);
  } finally { session.dispose(); renderer.dispose(); }
});
