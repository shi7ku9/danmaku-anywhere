import { type Clock, LoopClock, loopPeriod, VideoClock } from '../core/clock';
import type { Message, Status, VideoChoice } from '../core/messages';
import { type Bindings, DEFAULT_SETTINGS, type LibraryEntry, type PageDanmaku, type Settings } from '../core/types';
import { urlKey } from '../core/url-key';
import { getPageDanmaku, getSettings } from '../storage/store';
import { Overlay } from './overlay';
import { Renderer } from './renderer';
import { listVideos, resolveTarget, videoId } from './video-finder';

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
  private entry: PageDanmaku | null = null;
  private enabled = false;
  private settings: Settings = DEFAULT_SETTINGS;
  private target: HTMLVideoElement | null = null;
  /** The popup's video choice; kept only in memory, like the enabled state. */
  private choice: VideoChoice = 'auto';
  private clock: Clock | null = null;
  private frameId: number | null = null;
  /** Load of the current key's entry; calls for the same key wait on it. */
  private loading: Promise<void> = Promise.resolve();
  /** Bumped by every reload so only the newest one applies its result. */
  private loadVersion = 0;
  /** The newest reload, which an older one waits for when it is superseded. */
  private newestReload: Promise<void> = Promise.resolve();

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
   * Follows the library, looking only at this page's binding and its danmaku:
   * - a different danmaku bound (or none any more) reloads, since the binding is
   *   written last, so the comments are in place once it changes;
   * - an offset change alone is applied in place, keeping playback;
   * - a rename of the loaded danmaku is applied in place, without clearing the screen.
   */
  async onStorageChanged(changes: Record<string, { oldValue?: unknown; newValue?: unknown }>): Promise<void> {
    const library = changes.library;
    if (this.entry && library) {
      const name = (value: unknown) =>
        (value as LibraryEntry[] | undefined)?.find((e) => e.id === this.entry?.id)?.name;
      const renamed = name(library.newValue);
      if (renamed !== undefined && renamed !== name(library.oldValue)) this.entry.name = renamed;
    }

    const bindings = changes.bindings;
    if (!bindings) return;
    const before = (bindings.oldValue as Bindings | undefined)?.[this.key];
    const after = (bindings.newValue as Bindings | undefined)?.[this.key];
    if (before?.danmakuId !== after?.danmakuId) {
      await this.reload();
    } else if (this.entry && after && after.offset !== before?.offset) {
      this.entry.offset = after.offset;
    }
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
    this.choice = 'auto';
    // Drop the old entry now so nothing can enable or edit it while the new one loads.
    this.entry = null;
    this.renderer.setComments([]);
    this.loading = this.reload();
    await this.loading;
  }

  /**
   * Re-reads the current key's entry from storage. Resolves once the newest
   * overlapping reload has been applied, so a caller (such as the reply to a
   * popup's `reload` message) never reports state older than that reload.
   */
  reload(): Promise<void> {
    const version = ++this.loadVersion;
    const run = this.load(version);
    this.newestReload = run;
    return run;
  }

  private async load(version: number): Promise<void> {
    const entry = await getPageDanmaku(this.key);
    // A newer reload (or a URL change, which reloads) started meanwhile: it applies its own
    // result, and this one waits for it instead of returning while that state is still old.
    if (version !== this.loadVersion) return this.newestReload;
    this.entry = entry;
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

  /** Follows another video, or none (loop mode); the next frame rebuilds the clock. */
  setVideo(choice: VideoChoice): void {
    this.choice = choice;
    this.target = null;
    this.clock = null;
    this.renderer.clear();
  }

  /** The target for the current choice; a chosen video that is gone falls back to auto. */
  private resolveTarget(): HTMLVideoElement | null {
    const videos = document.querySelectorAll('video');
    const target = resolveTarget(this.choice, this.target, videos);
    if (target !== undefined) return target;
    this.choice = 'auto';
    return resolveTarget('auto', this.target, videos) ?? null;
  }

  status(): Status {
    // Same rule as the frame loop, so this is right even before the first frame.
    const target = this.resolveTarget();
    // While another choice is active, auto starts from scratch, as it would when chosen.
    const auto = this.choice === 'auto' ? target : resolveTarget('auto', null, document.querySelectorAll('video'));
    return {
      urlKey: this.key,
      title: this.deps.getTitle(),
      entry: this.entry
        ? { id: this.entry.id, name: this.entry.name, count: this.entry.comments.length, offset: this.entry.offset }
        : null,
      enabled: this.enabled,
      mode: target ? 'video' : 'loop',
      videos: listVideos(document.querySelectorAll('video')),
      choice: this.choice,
      autoTargetId: auto ? videoId(auto) : null,
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
      case 'setVideo':
        if (this.isFor(message.urlKey)) this.setVideo(message.choice);
        break;
      case 'toggle':
        this.toggle();
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
    const target = this.resolveTarget();
    if (target !== this.target || !this.clock) {
      this.target = target;
      this.clock = target
        ? new VideoClock(target)
        : new LoopClock(loopPeriod(this.entry.comments, this.settings.speed));
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
