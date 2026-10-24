import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ponytail: pinned xterm 5.5 / serialize 0.13 internals; remove when upstream fixes OSC 8 snapshots.
// https://github.com/xtermjs/xterm.js/issues/6189
export const serializeLinks = {
  name: 'serialize-osc8',
  setup(build) {
    build.onLoad({ filter: /[/\\]@xterm[/\\]addon-serialize[/\\]lib[/\\]addon-serialize\.js$/ }, async () => {
      let contents = await readFile('node_modules/@xterm/addon-serialize/src/SerializeAddon.ts', 'utf8');
      const changes = [
        ['class StringSerializeHandler extends BaseSerializeHandler {', String.raw`
function openLink(terminal: Terminal, urlId: number): string {
  const link = (terminal as any)._core._oscLinkService.getLinkData(urlId);
  return link ? '\x1b]8;id=' + (link.id ?? 'termdock-' + urlId) + ';' + link.uri + '\x1b\\' : '';
}
class StringSerializeHandler extends BaseSerializeHandler {
  private _activeUrlId = 0;`],
        ['      this._currentRow += cell.getChars();\n\n      // update cursor', String.raw`
      const urlId = (cell as any).hasExtendedAttrs() ? (cell as any).extended.urlId : 0;
      if (urlId !== this._activeUrlId) {
        if (this._activeUrlId) this._currentRow += '\x1b]8;;\x1b\\';
        this._currentRow += openLink(this._terminal, urlId);
        this._activeUrlId = urlId;
      }
      this._currentRow += cell.getChars();

      // update cursor`],
        ['    // if there is colorful empty cell at line end, whe must pad it back, or the the color block', String.raw`
    if (this._activeUrlId) {
      this._currentRow += '\x1b]8;;\x1b\\';
      this._activeUrlId = 0;
    }
    // if there is colorful empty cell at line end, whe must pad it back, or the the color block`],
        ['      content += this._serializeModes(this._terminal);\n    }', String.raw`
      content += this._serializeModes(this._terminal);
    }
    // The next live packet may continue an OSC 8 link opened before the snapshot.
    content += openLink(this._terminal, (this._terminal as any)._core._inputHandler._curAttrData.extended.urlId);`],
      ];
      for (const [before, after] of changes) {
        if (contents.split(before).length !== 2) throw new Error('xterm serializer changed; review the OSC 8 snapshot patch.');
        contents = contents.replace(before, after);
      }
      return { contents, loader: 'ts', resolveDir: resolve('node_modules/@xterm/addon-serialize/src') };
    });
    build.onResolve({ filter: /^(browser|common)\// }, args => {
      const file = resolve('node_modules/@xterm/xterm/src', args.path);
      return { path: file + (existsSync(file + '.ts') ? '.ts' : '.d.ts') };
    });
  },
};
