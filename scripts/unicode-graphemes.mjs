import { readFile } from 'node:fs/promises';

export const unicodeGraphemes = {
  name: 'unicode-graphemes-buffer-offset',
  setup(build) {
    build.onLoad({ filter: /[/\\]@xterm[/\\]addon-unicode-graphemes[/\\]lib[/\\]addon-unicode-graphemes\.m?js$/ }, async ({ path }) => {
      const source = await readFile(path, 'utf8');
      const view = /new DataView\((\w+)\.buffer\)/g;
      if ([...source.matchAll(view)].length !== 1) throw new Error('Review the Unicode Graphemes Addon 0.4.0 Buffer offset fix.');
      return { contents: source.replace(view, 'new DataView($1.buffer,$1.byteOffset,$1.byteLength)'), loader: 'js' };
    });
  },
};
