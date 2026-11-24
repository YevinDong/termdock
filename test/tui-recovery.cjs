let pending = '';
let queries = 0;
let clicks = 0;
let wheels = 0;

function header() {
  process.stdout.write(`\x1b7\x1b[1;1H\x1b[2KQUERY=${queries} CLICK=${clicks} WHEEL=${wheels}\x1b8`);
}

process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdout.on('resize', () => process.stdout.write('\x1b7\x1b[2;5r\x1b8'));
process.stdin.on('data', data => {
  pending += data;
  while (pending) {
    const token = /^(?:\x1b\[<\d+;\d+;\d+[Mm]|\x1b\[\d+;\d+R|\x1b\[[IO]|[?q])/.exec(pending)?.[0];
    if (!token) {
      if (pending.startsWith('\x1b')) break;
      pending = pending.slice(1);
      continue;
    }
    pending = pending.slice(token.length);
    if (token === 'q') {
      process.stdout.write('\x1b[?1000l\x1b[?1006l\x1b[?1004l\x1b[?1049l');
      process.stdin.setRawMode(false);
      process.exit(0);
    }
    if (token === '?') process.stdout.write('\x1b[6n');
    else if (token.endsWith('R')) { queries++; header(); }
    else if (/^\x1b\[<0;\d+;6M$/.test(token)) { clicks++; header(); }
    else if (/^\x1b\[<65;/.test(token)) {
      wheels++;
      process.stdout.write(`\r\nSCROLL_${wheels}`);
      header();
    }
  }
});
process.stdout.write('\x1bc\x1b[?1049h\x1b[?1000h\x1b[?1006h\x1b[?1004h' +
  '\x1b[2;1Hrow1\x1b[3;1Hrow2\x1b[4;1Hrow3\x1b[5;1Hrow4\x1b[6;1HCLICK_ME' +
  '\x1b[2;5r\x1b[5;1H\x1b[6n');
