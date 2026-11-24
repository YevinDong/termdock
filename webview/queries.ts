import type { Terminal } from '@xterm/xterm';

export function useHostQueryResponses(terminal: Pick<Terminal, 'parser'>) {
  const handlers = [
    terminal.parser.registerCsiHandler({ final: 'c' }, () => true),
    terminal.parser.registerCsiHandler({ prefix: '>', final: 'c' }, () => true),
    terminal.parser.registerCsiHandler({ final: 'n' }, () => true),
    terminal.parser.registerCsiHandler({ prefix: '?', final: 'n' }, () => true),
    terminal.parser.registerCsiHandler({ intermediates: '$', final: 'p' }, () => true),
    terminal.parser.registerCsiHandler({ prefix: '?', intermediates: '$', final: 'p' }, () => true),
    terminal.parser.registerCsiHandler({ final: 't' }, params => params[0] === 18),
    terminal.parser.registerDcsHandler({ intermediates: '$', final: 'q' }, () => true)
  ];
  return { dispose() { for (const handler of handlers) handler.dispose(); } };
}
