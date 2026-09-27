import { LoopClock, VideoClock, loopPeriod, type Clock } from '../core/clock';
import type { Message, Status } from '../core/messages';
import { DEFAULT_SETTINGS, type DanmakuEntry, type Settings } from '../core/types';
import { urlKey } from '../core/url-key';
import { getEntry, getSettings, listEntries, setOffset } from '../storage/store';
import { Overlay } from './overlay';
import { Renderer } from './renderer';
import { chooseTarget } from './video-finder';

export interface ControllerDeps {
  getUrl(): string;
  getTitle(): string;
  requestFrame(cb: () => void): number;
  cancelFrame(id: number): void;
  measure?: (el: HTMLElement) => number;
}

/** Owns one tab's danmaku: which entry is loaded, whether it is on, and the frame loop. */
export class Controller {
  private readonly deps: ControllerDeps;
  private readonly overlay = new Overlay();
  private readonly renderer: Renderer;
  private key = '';
  private entry: DanmakuEntry | null = null;
  private fileName = '';
  private enabled = false;
  private settings: Settings = DEFAULT_SETTINGS;
  private target: HTMLVideoElement | null = null;
  private clock: Clock | null = null;
  private frameId: number | null = null;
  /** Load of the current key's entry; calls for the same key wait on it. */
  private loading: Promise<void> = Promise.resolve();
  /** Bumped by every reload so only the newest one applies its result. */
  private loadVersion = 0;

  constructor(deps: ControllerDeps) {
    this.deps = deps;
    this.renderer = new Renderer(this.overlay.stage, { measure: deps.measure });
  }

  async start(): Promise<void> {
    this.applySettings(await getSettings());
    await this.checkUrl();
  }

  applySettings(settings: Settings): void {
    this.settings = settings;
    this.renderer.setSettings(settings);
    // Keep playback time; only the loop length depends on settings (speed).
    if (this.clock instanceof LoopClock && this.entry) {
      this.clock.setPeriod(loopPeriod(this.entry.comments, settings.speed), this.entry.offset);
    }
  }

  /**
   * Reloads when another page imports, replaces or deletes this URL's entry.
   * Watches the index rather than the entry: the index is written last, so the
   * comments are in place once its row changes, and offset writes never touch it.
   */
  async onStorageChanged(changes: Record<string, { oldValue?: unknown; newValue?: unknown }>): Promise<void> {
    // Offset set from another tab: apply in place, keeping playback and comments.
    const offset = changes[`offset:${this.key}`]?.newValue;
    if (this.entry && typeof offset === 'number') this.entry.offset = offset;

    const change = changes['index'];
    if (!change) return;
    const row = (index: unknown) =>
      JSON.stringify(Array.isArray(index) ? index.find((e: { urlKey?: string }) => e?.urlKey === this.key) : undefined);
    if (row(change.oldValue) !== row(change.newValue)) await this.reload();
  }

  /** Turns danmaku off and loads the new entry when the page's URL key changes. */
  async checkUrl(): Promise<void> {
    let key: string;
    try {
      key = urlKey(this.deps.getUrl());
    } catch {
      key = '';
    }
    if (key === this.key) return this.loading;
    this.key = key;
    this.setEnabled(false);
    // Drop the old entry now so nothing can enable or edit it while the new one loads.
    this.entry = null;
    this.fileName = '';
    this.renderer.setComments([]);
    this.loading = this.reload();
    await this.loading;
  }

  /** Re-reads the current key's entry from storage. */
  async reload(): Promise<void> {
    const version = ++this.loadVersion;
    const [entry, index] = await Promise.all([getEntry(this.key), listEntries()]);
    // A newer reload (or a URL change, which reloads) started meanwhile.
    if (version !== this.loadVersion) return;
    const key = this.key;
    const meta = index.find((e) => e.urlKey === key);
    this.entry = entry && meta ? entry : null;
    this.fileName = meta?.fileName ?? '';
    this.renderer.setComments(this.entry?.comments ?? []);
    this.clock = null;
    if (!this.entry) this.setEnabled(false);
  }

  setEnabled(on: boolean): void {
    const next = on && this.entry !== null;
    if (next === this.enabled) return;
    this.enabled = next;
    this.target = null;
    this.clock = null;
    if (next) {
      this.scheduleFrame();
    } else {
      if (this.frameId !== null) this.deps.cancelFrame(this.frameId);
      this.frameId = null;
      this.renderer.clear();
      this.overlay.remove();
    }
  }

  toggle(): void {
    this.setEnabled(!this.enabled);
  }

  async setOffset(offset: number): Promise<void> {
    if (!this.entry) return;
    this.entry.offset = offset;
    await setOffset(this.key, offset);
  }

  status(): Status {
    // Before the first frame picks a target, predict it with the same rule.
    const target = this.target ?? chooseTarget(null, document.querySelectorAll('video'));
    return {
      urlKey: this.key,
      title: this.deps.getTitle(),
      entry: this.entry
        ? { fileName: this.fileName, count: this.entry.comments.length, offset: this.entry.offset }
        : null,
      enabled: this.enabled,
      mode: target ? 'video' : 'loop',
    };
  }

  async handleMessage(message: Message): Promise<Status> {
    // SPA navigations can land after the location event fired; never act on a stale page.
    await this.checkUrl();
    switch (message.type) {
      case 'getStatus':
        break;
      case 'setEnabled':
        if (this.isFor(message.urlKey)) this.setEnabled(message.enabled);
        break;
      case 'toggle':
        this.toggle();
        break;
      case 'setOffset':
        if (this.isFor(message.urlKey)) await this.setOffset(message.offset);
        break;
      case 'reload':
        await this.reload();
        break;
    }
    return this.status();
  }

  private isFor(urlKey: string | undefined): boolean {
    return urlKey === undefined || urlKey === this.key;
  }

  /** Draws one frame and schedules the next while enabled. */
  tick(): void {
    this.frameId = null;
    if (!this.enabled || !this.entry) return;
    const target = chooseTarget(this.target, document.querySelectorAll('video'));
    if (target !== this.target || !this.clock) {
      this.target = target;
      this.clock = target ? new VideoClock(target) : new LoopClock(loopPeriod(this.entry.comments, this.settings.speed));
      this.overlay.setTarget(target);
      this.renderer.clear();
    }
    const { width, height } = this.overlay.layout();
    // In loop mode the offset shifts the loop phase; with a video it shifts the timeline.
    const { offset } = this.entry;
    const t = this.clock instanceof LoopClock ? this.clock.now(offset) : this.clock.now() + offset;
    this.renderer.frame(t, width, height);
    this.scheduleFrame();
  }

  private scheduleFrame(): void {
    this.frameId = this.deps.requestFrame(() => {
      this.frameId = null;
      this.tick();
    });
  }
}
