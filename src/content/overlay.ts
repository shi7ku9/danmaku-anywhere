const CSS = `
.stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  line-height: 1.25;
}
.c {
  position: absolute;
  left: 0;
  white-space: pre;
  will-change: transform;
}
.c.fixed {
  left: 50%;
  transform: translateX(-50%);
}
`;

/** A click-through layer over the target video (or the viewport) that hosts the stage. */
export class Overlay {
  readonly stage: HTMLElement;
  private readonly host: HTMLElement;
  private target: HTMLVideoElement | null = null;

  constructor() {
    this.host = document.createElement('danmaku-overlay');
    this.host.style.cssText =
      'all: initial; display: block; position: fixed; pointer-events: none; z-index: 2147483647; overflow: hidden;';
    const shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    this.stage = document.createElement('div');
    this.stage.className = 'stage';
    shadow.append(style, this.stage);
  }

  setTarget(video: HTMLVideoElement | null): void {
    this.target = video;
  }

  /**
   * Attaches the host where it will be visible and matches it to the target's
   * box. Polled every frame, which also covers scrolling, resizing and
   * fullscreen changes without extra observers.
   */
  layout(): { width: number; height: number } {
    // Only the fullscreen element's subtree is shown in fullscreen. If the
    // video itself is fullscreen nothing can be drawn over it.
    const fullscreen = document.fullscreenElement;
    const parent = fullscreen && fullscreen !== this.target ? fullscreen : document.documentElement;
    if (this.host.parentNode !== parent) parent.append(this.host);

    const r = this.target
      ? this.target.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const s = this.host.style;
    s.left = `${r.left}px`;
    s.top = `${r.top}px`;
    s.width = `${r.width}px`;
    s.height = `${r.height}px`;
    return { width: r.width, height: r.height };
  }

  remove(): void {
    this.host.remove();
  }
}
