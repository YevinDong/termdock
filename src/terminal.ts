import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes';
import type { Terminal } from '@xterm/xterm';

export function enableUnicode(terminal: Pick<Terminal, 'loadAddon' | 'unicode'>) {
  terminal.loadAddon(new UnicodeGraphemesAddon());
  terminal.unicode.activeVersion = '15-graphemes';
}

export interface TerminalSize { cols: number; rows: number; }

interface AlternateLine {
  length: number;
  getWidth(column: number): number;
  setCell(column: number, cell: unknown): void;
  resize(cols: number, fill: unknown): boolean;
}

interface AlternateBuffer {
  lines: { length: number; get(row: number): AlternateLine };
  getNullCell(): unknown;
}

export function resizeTerminal(terminal: Pick<Terminal, 'cols' | 'resize'>, { cols, rows }: TerminalSize) {
  const shrinking = cols < terminal.cols;
  terminal.resize(cols, rows);
  if (!shrinking) return;

  const { _core } = terminal as unknown as { _core: { _bufferService: { buffers: { alt: AlternateBuffer } } } };
  const alternate = _core._bufferService.buffers.alt;
  const blank = alternate.getNullCell();
  for (let row = 0; row < alternate.lines.length; row++) {
    const line = alternate.lines.get(row);
    if (line.length <= cols) continue;
    if (line.getWidth(cols - 1) === 2) line.setCell(cols - 1, blank);
    line.resize(cols, blank);
  }
}
