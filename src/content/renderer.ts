import { allocateLane, createLanes, FIXED_DURATION, scrollX, type Lanes, type StageGeometry } from '../core/lanes';
import { lowerBound } from '../core/timeline';
import { DEFAULT_SETTINGS, type Comment, type Settings } from '../core/types';

const BASE_FONT_SIZE = 25;
/** Must match `line-height` in the overlay CSS. */
const LINE_HEIGHT = 1.25;
const MAX_ACTIVE = 150;
/** A jump larger than this between frames (seconds) is treated as a seek. */
const SEEK_THRESHOLD = 1;

interface Active {
  comment: Comment;
  el: HTMLElement;
  width: number;
}

export interface RendererOptions {
  /** Measures a comment element's width in px. Injectable for tests. */
  measure?: (el: HTMLElement) => number;
}

/** Draws comments onto a stage element for a given playback time. */
export class Renderer {
  private readonly stage: HTMLElement;
  private readonly measure: (el: HTMLElement) => number;
  private comments: readonly Comment[] = [];
  private settings: Settings = DEFAULT_SETTINGS;
  private lanes: Lanes = createLanes(0);
  private active: Active[] = [];
  private readonly pool: HTMLElement[] = [];
  /** Index of the next comment to consider spawning. */
  private cursor = 0;
  private lastT = Number.NaN;
  private width = 0;
  private height = 0;

  constructor(stage: HTMLElement, options: RendererOptions = {}) {
    this.stage = stage;
    this.measure = options.measure ?? ((el) => el.offsetWidth);
  }

  get activeCount(): number {
    return this.active.length;
  }

  setComments(comments: readonly Comment[]): void {
    this.comments = comments;
    this.clear();
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.stage.style.opacity = String(settings.opacity);
    this.stage.style.fontSize = `${BASE_FONT_SIZE * settings.fontScale}px`;
    this.clear();
  }

  /** Removes everything; the next frame re-spawns whatever should be visible. */
  clear(): void {
    for (const a of this.active) this.release(a.el);
    this.active = [];
    this.lastT = Number.NaN;
  }

  frame(t: number, width: number, height: number): void {
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.clear();
    }
    if (Number.isNaN(this.lastT) || t < this.lastT || t - this.lastT > SEEK_THRESHOLD) this.reset(t);
    this.lastT = t;
    const g: StageGeometry = { width: this.width, speed: this.settings.speed };
    this.spawn(t, g);
    this.update(t, g);
  }

  private get laneHeight(): number {
    return BASE_FONT_SIZE * this.settings.fontScale * LINE_HEIGHT;
  }

  private duration(comment: Comment): number {
    return comment.mode === 'scroll' ? this.settings.speed : FIXED_DURATION;
  }

  /** Rebuilds lanes and rewinds the cursor so comments already in flight at t reappear. */
  private reset(t: number): void {
    for (const a of this.active) this.release(a.el);
    this.active = [];
    this.lanes = createLanes(Math.max(0, Math.floor(this.height / this.laneHeight)));
    this.cursor = lowerBound(this.comments, t - Math.max(this.settings.speed, FIXED_DURATION));
  }

  private spawn(t: number, g: StageGeometry): void {
    while (this.cursor < this.comments.length) {
      const comment = this.comments[this.cursor]!;
      if (comment.time > t) break;
      this.cursor++;
      if (t - comment.time >= this.duration(comment) || this.active.length >= MAX_ACTIVE) continue;

      const el = this.pool.pop() ?? document.createElement('div');
      el.textContent = comment.text;
      el.className = comment.mode === 'scroll' ? 'c' : 'c fixed';
      el.style.color = comment.color;
      el.style.transform = '';
      this.stage.append(el);
      const width = this.measure(el);
      const lane = allocateLane(this.lanes, g, { time: comment.time, mode: comment.mode, width }, t);
      if (lane < 0) {
        this.release(el);
        continue;
      }
      el.style.top = `${lane * this.laneHeight}px`;
      this.active.push({ comment, el, width });
    }
  }

  private update(t: number, g: StageGeometry): void {
    this.active = this.active.filter((a) => {
      if (t - a.comment.time >= this.duration(a.comment)) {
        this.release(a.el);
        return false;
      }
      if (a.comment.mode === 'scroll') {
        a.el.style.transform = `translateX(${scrollX(g, a.comment.time, a.width, t)}px)`;
      }
      return true;
    });
  }

  private release(el: HTMLElement): void {
    el.remove();
    this.pool.push(el);
  }
}
