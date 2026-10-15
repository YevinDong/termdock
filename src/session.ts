import type { IPty } from 'node-pty';
import { Terminal } from '@xterm/headless';
import { SerializeAddon } from '@xterm/addon-serialize';
import { AnsiTail } from './ansi';
export { AnsiTail } from './ansi';
export interface SessionInfo { id: string; name: string; cwd: string; running: boolean; exitCode?: number; }
export class Session {
  readonly mirror: Terminal;
  readonly serializer: SerializeAddon;
  running = true;
  exitCode?: number;
  seq = 0;
  private pending = 0;
  private disposed = false;
  private paused = false;
  private connected = false;
  private connectionEpoch = 0;
  private readonly ansi = new AnsiTail();
  private clientPending = 0;
  private unacknowledged = new Map<number,number>();
  private outputQueue = '';
  private outputSeq = 0;
  private timer?: NodeJS.Timeout;
  private snapshotting = false;
  private afterSnapshot: {data: string; seq: number}[] = [];
  private snapshotRequests: (() => void)[] = [];
  private subscriptions: {dispose(): void}[] = [];
  private exitSubscription?: {dispose(): void};
  private terminationTimer?: NodeJS.Timeout;
  constructor(readonly id: string, readonly name: string, readonly cwd: string, readonly pty: IPty, scrollback: number,
    private readonly send: (message: unknown) => void, private readonly changed: () => void) {
    this.mirror = new Terminal({ cols: pty.cols, rows: pty.rows, scrollback, allowProposedApi: true });
    this.serializer = new SerializeAddon(); this.mirror.loadAddon(this.serializer);
    this.subscriptions.push(this.mirror.onData(data=>{if(!this.connected && this.running) this.pty.write(data);}));
    this.subscriptions.push(pty.onData(data => this.receive(data)));
    this.exitSubscription = pty.onExit(e => {
      if (this.terminationTimer) clearTimeout(this.terminationTimer);
      this.terminationTimer = undefined;
      this.exitSubscription?.dispose(); this.exitSubscription = undefined;
      if (this.disposed) return;
      this.running = false; this.exitCode = e.exitCode;
      this.receive(`\r\n\x1b[90m[Process exited with code ${e.exitCode}. Start a new terminal or restart.]\x1b[0m\r\n`);
      this.flush(); this.changed();
    });
  }
  info(): SessionInfo { return { id: this.id, name: this.name, cwd: this.cwd, running: this.running, exitCode: this.exitCode }; }
  private receive(data: string) {
    if (this.disposed) return;
    data = this.ansi.push(data);
    if (!data) return;
    this.seq++; this.pending += data.length;
    this.updateFlow();
    this.mirror.write(data, () => {
      this.pending -= data.length;
      this.updateFlow();
    });
    if (!this.connected) return;
    if (this.snapshotting) this.afterSnapshot.push({ data, seq: this.seq });
    else { this.outputQueue += data; this.outputSeq = this.seq; this.scheduleFlush(); }
  }
  private scheduleFlush() { if (!this.timer) this.timer = setTimeout(() => { this.timer = undefined; this.flush(); }, 16); }
  private flush() {
    if (this.outputQueue) { if(this.connected) { this.track(this.outputSeq,this.outputQueue.length); this.send({ type: 'data', id: this.id, data: this.outputQueue, seq: this.outputSeq }); } this.outputQueue = ''; }
  }
  snapshot(done?: () => void) {
    if (this.disposed || !this.connected) { done?.(); return; }
    if (done) this.snapshotRequests.push(done);
    if (this.snapshotting) return;
    this.flush(); this.snapshotting = true;
    const seq = this.seq;
    const epoch = this.connectionEpoch;
    const tail = this.ansi.tail;
    this.mirror.write('', () => {
      if (this.disposed || !this.connected || epoch !== this.connectionEpoch) {
        this.snapshotting=false;this.afterSnapshot=[];
        // A reconnect may occur before this queued parser callback executes.
        // Requeue behind ALL output received since the original snapshot cutoff.
        if (!this.disposed && this.connected) this.snapshot();
        else for (const cb of this.snapshotRequests.splice(0)) cb();
        return;
      }
      const data = this.serializer.serialize() + tail;
      this.unacknowledged.clear();this.clientPending=0;this.track(seq,data.length);
      this.send({ type: 'snapshot', id: this.id, data, seq, cols: this.mirror.cols, rows: this.mirror.rows });
      this.snapshotting = false;
      for (const packet of this.afterSnapshot) { this.outputQueue += packet.data; this.outputSeq = packet.seq; }
      this.afterSnapshot = []; this.flush();
      for (const cb of this.snapshotRequests.splice(0)) cb();
    });
  }
  private track(seq: number, bytes: number) { this.unacknowledged.set(seq,(this.unacknowledged.get(seq)||0)+bytes); this.clientPending+=bytes; this.updateFlow(); }
  ack(seq: number) {
    if(seq>this.seq) return;
    for(const [key,bytes] of this.unacknowledged) if(key<=seq) {this.clientPending-=bytes;this.unacknowledged.delete(key);}
    this.updateFlow();
  }
  setConnected(value: boolean) {
    if (this.connected !== value) this.connectionEpoch++;
    this.connected=value;
    if(!value) {this.unacknowledged.clear();this.clientPending=0;this.outputQueue='';this.afterSnapshot=[];this.updateFlow();}
  }
  private updateFlow() {
    if(!this.running || this.disposed) return;
    if((this.pending>128*1024 || this.clientPending>256*1024) && !this.paused) {this.pty.pause();this.paused=true;}
    else if(this.paused && this.pending<32*1024 && this.clientPending<64*1024) {this.paused=false;this.pty.resume();}
  }
  write(data: string) { if (this.running && !this.disposed) this.pty.write(data); }
  resize(cols: number, rows: number) {
    if (this.disposed || (cols === this.mirror.cols && rows === this.mirror.rows)) return;
    this.mirror.resize(cols, rows);
    if (this.running) this.pty.resize(cols, rows);
  }
  clear() { this.mirror.write('',()=>{if(!this.disposed) {this.mirror.clear();this.snapshot();}}); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    for (const d of this.subscriptions) d.dispose();
    if (this.running) {
      // Let pending output/EOF drain so the native exit callback can be observed.
      if (this.paused) { this.paused = false; try { this.pty.resume(); } catch { /* Already exited. */ } }
      // Keep observing exit while HUP gets a chance to clean up foreground jobs.
      // A shell that ignores HUP must not outlive its closed terminal indefinitely.
      this.terminationTimer = setTimeout(() => {
        if (process.platform !== 'win32') {
          try { this.pty.kill('SIGKILL'); } catch { /* Already exited. */ }
        }
        this.exitSubscription?.dispose(); this.exitSubscription = undefined;
        this.terminationTimer = undefined;
      }, 1000);
      this.terminationTimer.unref();
      try { this.pty.kill(); } catch { /* Already exited. */ }
    } else { this.exitSubscription?.dispose(); this.exitSubscription = undefined; }
    this.running = false; this.mirror.dispose(); this.afterSnapshot = []; this.snapshotRequests = [];
  }
}
