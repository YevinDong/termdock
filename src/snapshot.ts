import { captureAlternateRows, restoreAlternateRows, type AlternateRows } from './alternate';

interface BufferState {
  x: number;
  y: number;
  scrollTop: number;
  scrollBottom: number;
  savedX: number;
  savedY: number;
  savedForeground: number;
  savedBackground: number;
  savedCharset?: Record<string, string> | null;
}

interface RuntimeBuffer {
  x: number;
  y: number;
  ybase: number;
  scrollTop: number;
  scrollBottom: number;
  savedX: number;
  savedY: number;
  savedCurAttrData: { fg: number; bg: number };
  savedCharset?: Record<string, string> | null;
}

export interface SnapshotState { normal: BufferState; alt: BufferState; alternateRows?: AlternateRows; }

function buffers(terminal: unknown) {
  return (terminal as { _core: { _bufferService: { buffers: { normal: RuntimeBuffer; alt: RuntimeBuffer } } } })
    ._core._bufferService.buffers;
}

function capture(buffer: RuntimeBuffer): BufferState {
  return {
    x: buffer.x, y: buffer.y, scrollTop: buffer.scrollTop, scrollBottom: buffer.scrollBottom,
    savedX: buffer.savedX, savedY: buffer.savedY - buffer.ybase,
    savedForeground: buffer.savedCurAttrData.fg, savedBackground: buffer.savedCurAttrData.bg,
    savedCharset: buffer.savedCharset && { ...buffer.savedCharset }
  };
}

export function captureSnapshotState(terminal: unknown): SnapshotState {
  const source = buffers(terminal);
  return { normal: capture(source.normal), alt: capture(source.alt), alternateRows: captureAlternateRows(terminal) };
}

export function restoreSnapshotState(terminal: { rows: number; refresh?(start: number, end: number): void }, state: SnapshotState) {
  const target = buffers(terminal);
  for (const name of ['normal', 'alt'] as const) {
    const buffer = target[name], saved = state[name];
    buffer.x = saved.x;
    buffer.y = saved.y;
    buffer.scrollTop = saved.scrollTop;
    buffer.scrollBottom = saved.scrollBottom;
    buffer.savedX = saved.savedX;
    buffer.savedY = buffer.ybase + saved.savedY;
    buffer.savedCurAttrData.fg = saved.savedForeground;
    buffer.savedCurAttrData.bg = saved.savedBackground;
    buffer.savedCharset = saved.savedCharset && { ...saved.savedCharset };
  }
  if (state.alternateRows) restoreAlternateRows(terminal, state.alternateRows);
  terminal.refresh?.(0, terminal.rows - 1);
}
