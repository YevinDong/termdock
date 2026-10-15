const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Terminal } = require('@xterm/headless');
const { SerializeAddon } = require('@xterm/addon-serialize');
const { AnsiTail, Session } = require('../dist/session');
const write = (term, data) => new Promise(resolve => term.write(data, resolve));

test('partial CSI, OSC, DCS, ESC, C1, ST, and cancellation tails', () => {
  for (const [before, tail, after] of [
    ['text\x1b[3', '\x1b[3', '1m'],
    ['\x1b(', '\x1b(', 'B'],
    ['\x1b]2;title', '\x1b]2;title', '\x07'],
    ['\x1b]2;title\x1b', '\x1b', '\\'],
    ['\x1bP$q', '\x1bP$q', 'm\x9c'],
    ['\x9b?25', '\x9b?25', 'l'],
    ['\x9d2;title', '\x9d2;title', '\x9c'],
    ['\x90$qm', '\x90$qm', '\x18'],
    ['\x1b[31', '\x1b[31', '\x1a'],
    ['\x1b[31', '\x1b[31', '\x85'],
    ['\x1b_ignored', '\x1b_', '\x9c'],
    ['\x1b[??broken', '', ''],
  ]) {
    const parser = new AnsiTail();
    assert.equal(parser.push(before), before);
    assert.equal(parser.tail, tail, JSON.stringify(before));
    assert.equal(parser.push(after), after);
    assert.equal(parser.tail, '', JSON.stringify(after));
  }
});

test('replay tails exclude C0 cursor actions already applied to a snapshot', () => {
  const parser = new AnsiTail();
  parser.push('\x1b[3\r\n\t\x00');
  assert.equal(parser.tail, '\x1b[3');
  parser.push('1m');
  assert.equal(parser.tail, '');
});

test('overlong control payload is bounded, cancelled, and never printed as text', () => {
  const parser = new AnsiTail(16);
  const first = parser.push('\x1b]2;' + 'x'.repeat(100000));
  assert.equal(first.length, 17);
  assert.ok(first.endsWith('\x18'));
  assert.equal(parser.tail, '');
  assert.equal(parser.push('hidden payload\x07safe'), 'safe');
  assert.equal(parser.tail, '');
  const second = new AnsiTail(8);
  second.push('\x1bP$q' + 'x'.repeat(30));
  assert.equal(second.push('suppressed\x1b[31mred'), '\x1b[31mred');
});

test('snapshots reconstruct every chunk boundary in representative VT streams', async () => {
  const streams = [
    'prompt \x1b[31mred\x1b[0m tail',
    'hello\r\n\x1b[3\r1mred\x1b[0m',
    'hello\x1b]2;window title\x1b\\world',
    'hello\x1bP$qm\x1b\\world',
    'hello\x9b32mgreen\x9b0mworld',
    'hello\x1b[123\x18world',
    'hello\x1b_ignored\x1b\\world',
  ];
  for (const stream of streams) {
    for (let split = 0; split <= stream.length; split++) {
      const source = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
      const restored = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
      const serializer = new SerializeAddon(); source.loadAddon(serializer);
      const restoredSerializer = new SerializeAddon(); restored.loadAddon(restoredSerializer);
      const parser = new AnsiTail();
      try {
        await write(source, parser.push(stream.slice(0, split)));
        await write(restored, '\x1bc' + serializer.serialize() + parser.tail);
        const remaining = parser.push(stream.slice(split));
        await write(source, remaining); await write(restored, remaining);
        assert.equal(restoredSerializer.serialize(), serializer.serialize(), `split ${split}: ${JSON.stringify(stream)}`);
      } finally { source.dispose(); restored.dispose(); }
    }
  }
});

class FakePty extends EventEmitter {
  cols = 80; rows = 24; paused = false;
  onData(cb) { this.on('data', cb); return { dispose: () => this.off('data', cb) }; }
  onExit(cb) { this.on('exit', cb); return { dispose: () => this.off('exit', cb) }; }
  write() {} resize() {} pause() { this.paused = true; } resume() { this.paused = false; } kill() {}
}

test('disposing a flow-controlled terminal resumes the PTY to drain exit events', () => {
  const pty = new FakePty();
  const session = new Session('id', 'sh', '/tmp', pty, 100, () => {}, () => {});
  pty.emit('data', 'x'.repeat(150000));
  assert.equal(pty.paused, true);
  session.dispose();
  assert.equal(pty.paused, false);
});

test('reconnect during an in-flight snapshot includes disconnected output', async () => {
  const pty = new FakePty(); const messages = [];
  const session = new Session('id', 'sh', '/tmp', pty, 100, m => messages.push(m), () => {});
  try {
    session.setConnected(true); pty.emit('data', 'A'); session.snapshot();
    session.setConnected(false); pty.emit('data', 'B'); session.setConnected(true);
    await new Promise(resolve => session.snapshot(resolve));
    const snapshot = messages.filter(m => m.type === 'snapshot').at(-1);
    assert.equal(snapshot.seq, 2); assert.equal(snapshot.data, 'AB');
  } finally { session.dispose(); }
});

test('session snapshot retains incomplete escape state at its exact output cutoff', async () => {
  const pty = new FakePty(); const messages = [];
  const session = new Session('id', 'sh', '/tmp', pty, 100, m => messages.push(m), () => {});
  try {
    session.setConnected(true); pty.emit('data', 'prompt \x1b[3');
    const done = new Promise(resolve => session.snapshot(resolve));
    pty.emit('data', '1mred\x1b[0m');
    await done;
    const snapshot = messages.find(m => m.type === 'snapshot');
    assert.equal(snapshot.data, 'prompt \x1b[3'); assert.equal(snapshot.seq, 1);
    assert.ok(messages.some(m => m.type === 'data' && m.seq === 2 && m.data === '1mred\x1b[0m'));
  } finally { session.dispose(); }
});

test('close forcibly terminates a shell that ignores SIGHUP', { timeout: 5000, skip: process.platform === 'win32' }, async () => {
  const pty = require('../dist/vendor/pty').spawn('/bin/sh', ['-c', 'trap "" HUP; printf HUP_READY; read answer'], {
    cols: 80, rows: 24, cwd: '/tmp', env: { ...process.env, TERM: 'xterm-256color' },
  });
  const session = new Session('id', 'sh', '/tmp', pty, 100, () => {}, () => {});
  const exited = new Promise(resolve => pty.onExit(resolve));
  try {
    await new Promise(resolve => pty.onData(data => { if (data.includes('HUP_READY')) resolve(); }));
    session.dispose();
    const result = await exited;
    assert.equal(result.signal, 9);
  } finally { session.dispose(); try { pty.kill('SIGKILL'); } catch {} }
});
