/**
 * Tracks the unfinished part of a VT escape sequence for snapshot replay.
 * A serialized xterm buffer does not include the parser's pending sequence.
 * C0 actions already reflected in the buffer are excluded from the replay tail.
 * Overlong sequences are cancelled in BOTH emulators and their remaining payload
 * is discarded until a terminator or a fresh control-sequence introducer arrives.
 */
type State = 'ground' | 'escape' | 'escapeIntermediate' | 'csiEntry' | 'csiParam' |
  'csiIntermediate' | 'csiIgnore' | 'osc' | 'dcsEntry' | 'dcsParam' |
  'dcsIntermediate' | 'dcsIgnore' | 'dcs' | 'sos';

export class AnsiTail {
  private state: State = 'ground';
  private pending = '';
  private dropping = false;
  constructor(private readonly limit = 128 * 1024) {}
  get tail(): string { return this.dropping ? '' : this.pending; }

  push(data: string): string {
    let output = '';
    for (const character of data) {
      const code = character.codePointAt(0)!;
      const previous = this.state;
      let next = previous;
      let restart = false;
      let retain = true;

      if (code === 0x1b) { next = 'escape'; restart = true; }
      else if (code === 0x9b) { next = 'csiEntry'; restart = true; }
      else if (code === 0x9d) { next = 'osc'; restart = true; }
      else if (code === 0x90) { next = 'dcsEntry'; restart = true; }
      else if (code === 0x98 || code === 0x9e || code === 0x9f) { next = 'sos'; restart = true; }
      else if (code === 0x18 || code === 0x1a || code === 0x9c ||
        (code >= 0x80 && code <= 0x9a)) { next = 'ground'; }
      else if (code < 0x20) {
        if (previous === 'osc' && code === 0x07) next = 'ground';
        // DCS passthrough keeps C0 payload. Elsewhere it is executed or ignored.
        retain = previous === 'dcs';
      } else {
        const intermediate = code >= 0x20 && code <= 0x2f;
        const parameter = code >= 0x30 && code <= 0x3b;
        const prefix = code >= 0x3c && code <= 0x3f;
        const final = code >= 0x40 && code <= 0x7e;
        const ignored = code === 0x7f;
        switch (previous) {
          case 'ground': break;
          case 'escape':
            if (intermediate) next = 'escapeIntermediate';
            else if (code === 0x5b) next = 'csiEntry';
            else if (code === 0x5d) next = 'osc';
            else if (code === 0x50) next = 'dcsEntry';
            else if (code === 0x58 || code === 0x5e || code === 0x5f) next = 'sos';
            else if (!ignored) next = 'ground';
            break;
          case 'escapeIntermediate':
            if (!intermediate && !ignored) next = 'ground';
            break;
          case 'csiEntry': case 'csiParam': case 'csiIntermediate':
            if (intermediate) next = 'csiIntermediate';
            else if ((parameter || prefix) && previous === 'csiIntermediate') next = 'csiIgnore';
            else if (prefix && previous === 'csiParam') next = 'csiIgnore';
            else if (parameter || prefix) next = 'csiParam';
            else if (final || !ignored) next = 'ground';
            break;
          case 'csiIgnore':
            if (final) next = 'ground';
            break;
          case 'dcsEntry': case 'dcsParam': case 'dcsIntermediate':
            if (intermediate) next = 'dcsIntermediate';
            else if ((parameter || prefix) && previous === 'dcsIntermediate') next = 'dcsIgnore';
            else if (prefix && previous === 'dcsParam') next = 'dcsIgnore';
            else if (parameter || prefix) next = 'dcsParam';
            else if (final) next = 'dcs';
            else if (!ignored) next = 'ground';
            break;
          case 'dcsIgnore': case 'dcs': case 'osc': break;
          case 'sos':
            // xterm's VT500 parser treats non-ASCII in SOS/PM/APC as an error.
            if (code >= 0xa0) next = 'ground';
            break;
        }
        if (ignored && previous !== 'osc') retain = false;
        if (previous === 'sos') retain = false;
      }

      const wasDropping = this.dropping;
      this.state = next;
      if (restart) {
        this.dropping = false;
        this.pending = character;
      } else if (next === 'ground') {
        this.dropping = false;
        this.pending = '';
      } else if (retain && !this.dropping) {
        this.pending += character;
      }

      if (!wasDropping || restart) {
        if (this.pending.length > this.limit) {
          this.pending = '';
          this.dropping = true;
          output += '\x18'; // CAN cancels the partial sequence already delivered.
        } else {
          output += character;
        }
      }
    }
    return output;
  }
}
