const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the source directly, without a separate webview test build.
const filename = path.join(__dirname, '../webview/clipboard.ts');
const { outputText, diagnostics } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true,
});
assert.deepEqual(diagnostics, []);
const clipboardModule = { exports: {} };
vm.runInNewContext(outputText, { module: clipboardModule, exports: clipboardModule.exports }, { filename });
const { handleClipboardKey, handleNativePaste } = clipboardModule.exports;

function event(overrides = {}) {
  return {
    type: 'keydown', code: 'KeyV', metaKey: false, ctrlKey: false, shiftKey: false,
    defaultPrevented: false, propagationStopped: false, consumed: [],
    preventDefault() { this.defaultPrevented = true; this.consumed.push('preventDefault'); },
    stopPropagation() { this.propagationStopped = true; this.consumed.push('stopPropagation'); },
    ...overrides,
  };
}

function assertConsumed(e) {
  assert.equal(e.defaultPrevented, true);
  assert.equal(e.propagationStopped, true);
  assert.deepEqual(e.consumed, ['preventDefault', 'stopPropagation']);
}

const platforms = [
  { name: 'macOS', platform: 'MacIntel', modifiers: { metaKey: true } },
  { name: 'Windows', platform: 'Win32', modifiers: { ctrlKey: true, shiftKey: true } },
  { name: 'Linux', platform: 'Linux x86_64', modifiers: { ctrlKey: true, shiftKey: true } },
];

// Model VS Code's webview key forwarding: defaultPrevented does NOT stop it.
function forwardBubbledPaste(e, paste) {
  if (e.propagationStopped) return false;
  handleNativePaste(event({ type: 'paste' }), paste);
  return true;
}

test('regression fixture reproduces duplicate paste with preventDefault alone', () => {
  const e = event({ metaKey: true });
  let pastes = 0;
  const paste = () => pastes++;
  e.preventDefault();
  paste();
  assert.equal(e.defaultPrevented, true);
  assert.equal(forwardBubbledPaste(e, paste), true);
  assert.equal(pastes, 2);
});

for (const { name, platform, modifiers } of platforms) {
  test(`${name} clipboard paste prevents VS Code forwarding and pastes once`, () => {
    const e = event(modifiers);
    let pastes = 0;
    const paste = () => { assertConsumed(e); pastes++; };
    const result = handleClipboardKey(e, platform, { copy: () => assert.fail('unexpected copy'), paste });
    assert.equal(result, false);
    assert.equal(forwardBubbledPaste(e, paste), false);
    assert.equal(pastes, 1);
  });

  test(`${name} clipboard copy consumes the event before copying once`, () => {
    const e = event({ ...modifiers, code: 'KeyC' });
    let copies = 0;
    const result = handleClipboardKey(e, platform, {
      copy: () => { assertConsumed(e); copies++; },
      paste: () => assert.fail('unexpected paste'),
    });
    assert.equal(result, false);
    assert.equal(copies, 1);
  });

  test(`${name} Shift+Insert pastes once and stops forwarding`, () => {
    const e = event({ code: 'Insert', shiftKey: true });
    let pastes = 0;
    const paste = () => { assertConsumed(e); pastes++; };
    assert.equal(handleClipboardKey(e, platform, { copy: () => assert.fail('unexpected copy'), paste }), false);
    assert.equal(forwardBubbledPaste(e, paste), false);
    assert.equal(pastes, 1);
  });

  test(`${name} Ctrl+C and unrelated events remain available to xterm`, () => {
    for (const overrides of [
      { code: 'KeyC', ctrlKey: true },
      { code: 'KeyV' },
      { code: 'KeyA', ...modifiers },
      { code: 'Insert' },
      { ...modifiers, type: 'keyup' },
      { ...modifiers, type: 'keypress' },
    ]) {
      const e = event(overrides);
      const unexpected = () => assert.fail('unrelated event triggered a clipboard action');
      assert.equal(handleClipboardKey(e, platform, { copy: unexpected, paste: unexpected }), true);
      assert.equal(e.defaultPrevented, false);
      assert.equal(e.propagationStopped, false);
      assert.deepEqual(e.consumed, []);
    }
  });

  test(`${name} two intentional identical shortcut pastes are both retained`, () => {
    const pasted = [];
    for (let i = 0; i < 2; i++) {
      const e = event(modifiers);
      const paste = () => pasted.push('same clipboard contents');
      assert.equal(handleClipboardKey(e, platform, { copy: () => assert.fail('unexpected copy'), paste }), false);
      assert.equal(forwardBubbledPaste(e, paste), false);
    }
    assert.deepEqual(pasted, ['same clipboard contents', 'same clipboard contents']);
  });
}

test('native/context-menu paste is consumed before a single host paste request', () => {
  const e = event({ type: 'paste' });
  let pastes = 0;
  handleNativePaste(e, () => { assertConsumed(e); pastes++; });
  // Neither the browser default nor xterm's target/bubble listener may paste again.
  if (!e.defaultPrevented) pastes++;
  if (!e.propagationStopped) pastes++;
  assert.equal(pastes, 1);
});

test('two intentional identical native pastes are both retained', () => {
  const pasted = [];
  for (let i = 0; i < 2; i++) {
    const e = event({ type: 'paste' });
    handleNativePaste(e, () => pasted.push('same clipboard contents'));
    assertConsumed(e);
  }
  assert.deepEqual(pasted, ['same clipboard contents', 'same clipboard contents']);
});

test('an intentional native paste after a shortcut is not content/time deduplicated', () => {
  const pasted = [];
  const paste = () => pasted.push('same clipboard contents');
  handleClipboardKey(event({ metaKey: true }), 'MacIntel', { copy: () => {}, paste });
  handleNativePaste(event({ type: 'paste' }), paste);
  assert.deepEqual(pasted, ['same clipboard contents', 'same clipboard contents']);
});
