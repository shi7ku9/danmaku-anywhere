import { afterEach, describe, expect, it } from 'vitest';
import { Overlay } from './overlay';

let overlay: Overlay;

afterEach(() => overlay.remove());

describe('Overlay', () => {
  it('attaches a shadow-hosted stage on first layout', () => {
    overlay = new Overlay();
    overlay.layout();
    const host = document.querySelector('danmaku-overlay');
    expect(host?.parentNode).toBe(document.documentElement);
    expect(host?.shadowRoot?.querySelector('.stage')).toBe(overlay.stage);
  });

  it('covers the viewport without a target', () => {
    overlay = new Overlay();
    expect(overlay.layout()).toEqual({ width: window.innerWidth, height: window.innerHeight });
  });

  it('matches the target video box', () => {
    overlay = new Overlay();
    const video = document.createElement('video');
    video.getBoundingClientRect = () => ({ left: 10, top: 20, width: 640, height: 360 }) as DOMRect;
    overlay.setTarget(video);
    expect(overlay.layout()).toEqual({ width: 640, height: 360 });
    const host = document.querySelector<HTMLElement>('danmaku-overlay')!;
    expect([host.style.left, host.style.top, host.style.width, host.style.height]).toEqual([
      '10px',
      '20px',
      '640px',
      '360px',
    ]);
  });

  it('remove detaches the host', () => {
    overlay = new Overlay();
    overlay.layout();
    overlay.remove();
    expect(document.querySelector('danmaku-overlay')).toBeNull();
  });
});
