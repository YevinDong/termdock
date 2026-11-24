import type { Terminal } from '@xterm/xterm';

const WIDTH_SHIFT = 22;
const HAS_EXTENDED = 0x10000000;
const PROTECTED = 0x20000000;

interface ExtendedAttrs { ext: number; urlId: number; }
interface Cell {
  content: number;
  fg: number;
  bg: number;
  combinedData: string;
  extended: ExtendedAttrs;
}

interface Line {
  length: number;
  isWrapped: boolean;
  getWidth(column: number): number;
  loadCell(column: number, target: Cell): Cell;
  setCell(column: number, cell: Cell): void;
  setCellFromCodepoint(column: number, codepoint: number, width: number, attrs: Cell): void;
  addCodepointToCell(column: number, codepoint: number, width: number): void;
  fill(cell: Cell, respectProtect?: boolean): void;
  copyFrom(line: Line): void;
  resize(cols: number, fill: Cell): boolean;
}

interface Link { id?: string; uri: string; }
type Tail = Map<number, Cell>;
type SavedCell = [column: number, content: number, fg: number, bg: number, text: string, ext?: number, link?: Link];
export interface AlternateRows {
  wrapped: number[];
  tail: [row: number, cells: SavedCell[]][];
}

function core(terminal: unknown) {
  return (terminal as { _core: {
    _bufferService: { buffers: { active: unknown; alt: {
      y: number;
      ybase: number;
      lines: { length: number; get(row: number): Line };
      getNullCell(): Cell;
    } } };
    _oscLinkService: { getLinkData(id: number): Link | undefined; registerLink(link: Link): number };
  } })._core;
}

const hidden = new WeakMap<Line, Tail>();
const watched = new WeakSet<Line>();

function eraseTail(line: Line, respectProtect: boolean) {
  const tail = hidden.get(line);
  if (!tail) return;
  if (!respectProtect) hidden.delete(line);
  else for (const [column, cell] of tail) if (!(cell.bg & PROTECTED)) tail.delete(column);
}

export function trackAlternateErases(terminal: Pick<Terminal, 'parser'>) {
  for (const prefix of [undefined, '?']) {
    for (const final of ['K', 'J']) {
      terminal.parser.registerCsiHandler({ prefix, final }, ([mode = 0]) => {
        if (mode === 0 || (final === 'K' && mode === 2)) {
          const { alt, active } = core(terminal)._bufferService.buffers;
          if (alt === active) {
            const line = alt.lines.get(alt.ybase + alt.y);
            if (line) eraseTail(line, prefix === '?');
          }
        }
        return false;
      });
    }
  }
}

function watchLine(line: Line) {
  if (watched.has(line)) return;
  watched.add(line);
  const { setCell, setCellFromCodepoint, addCodepointToCell, fill, copyFrom } = line;
  const overwriteSplit = (column: number) => {
    if (column !== line.length - 1) return;
    const tail = hidden.get(line);
    if (tail?.delete(column)) tail.delete(column + 1);
  };
  line.setCell = (column, cell) => { overwriteSplit(column); setCell.call(line, column, cell); };
  line.setCellFromCodepoint = (column, codepoint, width, attrs) => {
    overwriteSplit(column); setCellFromCodepoint.call(line, column, codepoint, width, attrs);
  };
  line.addCodepointToCell = (column, codepoint, width) => {
    overwriteSplit(column); addCodepointToCell.call(line, column, codepoint, width);
  };
  line.fill = (cell, respectProtect = false) => { eraseTail(line, respectProtect); fill.call(line, cell, respectProtect); };
  line.copyFrom = source => { hidden.delete(line); copyFrom.call(line, source); };
}

function maskSplit(line: Line, column: number, blank: Cell, cell: Cell) {
  line.setCell(column, { ...blank, fg: cell.fg, bg: cell.bg & ~HAS_EXTENDED });
}

export function resizeAlternate(terminal: unknown, cols: number) {
  const alternate = core(terminal)._bufferService.buffers.alt;
  const blank = alternate.getNullCell();
  let changed = false;
  for (let row = 0; row < alternate.lines.length; row++) {
    const line = alternate.lines.get(row);
    const previousTail = hidden.get(line);
    if (!previousTail && line.length <= cols) continue;
    const tail = previousTail ?? new Map<number, Cell>();
    hidden.delete(line);
    if (line.length > cols) {
      const start = cols - (line.getWidth(cols - 1) === 2 ? 1 : 0);
      for (let column = start; column < line.length; column++) {
        if (tail.has(column)) continue;
        const cell = line.loadCell(column, { ...blank });
        if (cell.content !== blank.content || cell.fg || cell.bg) tail.set(column, cell);
      }
      if (start < cols) maskSplit(line, start, blank, tail.get(start)!);
      line.resize(cols, blank);
      changed = true;
    } else {
      for (const [column, cell] of tail) {
        const width = cell.content >> WIDTH_SHIFT;
        if (column >= cols) continue;
        if (column + width > cols) {
          maskSplit(line, column, blank, cell);
        } else {
          line.setCell(column, cell);
          tail.delete(column);
        }
        changed = true;
      }
    }
    if (tail.size) {
      watchLine(line);
      hidden.set(line, tail);
    }
  }
  return changed;
}

export function captureAlternateRows(terminal: unknown): AlternateRows | undefined {
  const { _bufferService, _oscLinkService } = core(terminal);
  const { lines } = _bufferService.buffers.alt;
  const saved: AlternateRows = { wrapped: [], tail: [] };
  for (let row = 0; row < lines.length; row++) {
    const line = lines.get(row);
    if (line.isWrapped) saved.wrapped.push(row);
    const tail = hidden.get(line);
    if (!tail?.size) continue;
    const cells: SavedCell[] = [];
    for (const [column, cell] of tail) {
      const entry: SavedCell = [column, cell.content, cell.fg, cell.bg, cell.combinedData];
      if (cell.bg & HAS_EXTENDED) {
        entry.push(cell.extended.ext);
        const linkId = cell.extended.urlId;
        const link = linkId && _oscLinkService.getLinkData(linkId);
        if (link) entry.push({ id: link.id ?? `termdock-${linkId}`, uri: link.uri });
      }
      cells.push(entry);
    }
    saved.tail.push([row, cells]);
  }
  return saved.tail.length || saved.wrapped.length ? saved : undefined;
}

export function restoreAlternateRows(terminal: unknown, saved: AlternateRows) {
  const { _bufferService, _oscLinkService } = core(terminal);
  const alternate = _bufferService.buffers.alt;
  const blank = alternate.getNullCell();
  const cursorY = alternate.y;
  for (const row of saved.wrapped) {
    if (row < alternate.lines.length) alternate.lines.get(row).isWrapped = true;
  }
  for (const [row, cells] of saved.tail) {
    if (row >= alternate.lines.length) continue;
    const line = alternate.lines.get(row);
    const tail: Tail = new Map();
    alternate.y = row - alternate.ybase;
    for (const [column, content, fg, bg, combinedData, ext, link] of cells) {
      const cell: Cell = { content, fg, bg, combinedData, extended: blank.extended };
      if (ext !== undefined) {
        const extended = alternate.getNullCell().extended;
        extended.ext = ext;
        extended.urlId = link ? _oscLinkService.registerLink(link) : 0;
        cell.extended = extended;
      }
      if (column === line.length - 1) maskSplit(line, column, blank, cell);
      tail.set(column, cell);
    }
    watchLine(line);
    hidden.set(line, tail);
  }
  alternate.y = cursorY;
}
