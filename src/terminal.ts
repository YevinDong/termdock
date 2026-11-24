import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes';
import type { Terminal } from '@xterm/xterm';
import { resizeAlternate, trackAlternateErases } from './alternate';

export function configureTerminal(terminal: Pick<Terminal, 'loadAddon' | 'unicode' | 'parser'>) {
  terminal.loadAddon(new UnicodeGraphemesAddon());
  terminal.unicode.activeVersion = '15-graphemes';
  trackAlternateErases(terminal);
}

export interface TerminalSize { cols: number; rows: number; }

export function resizeTerminal(terminal: Pick<Terminal, 'cols' | 'resize'> & Partial<Pick<Terminal, 'refresh'>>, { cols, rows }: TerminalSize) {
  const previousCols = terminal.cols;
  terminal.resize(cols, rows);
  if (terminal.cols !== previousCols && resizeAlternate(terminal, terminal.cols)) terminal.refresh?.(0, rows - 1);
}
