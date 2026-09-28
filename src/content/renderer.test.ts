import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Comment, type CommentMode } from '../core/types';
import { Renderer } from './renderer';

const c = (time: number, mode: CommentMode = 'scroll'): Comment => ({ time, text: `c${time}`, mode, color: '#ffffff' });

let stage: HTMLElement;
let renderer: Renderer;

beforeEach(() => {
  stage = document.createElement('div');
  renderer = new Renderer(stage, { measure: () => 100 });
});

describe('Renderer', () => {
  it('shows comments whose time has come', () => {
    renderer.setComments([c(0), c(1), c(5)]);
    renderer.frame(1.5, 1000, 500);
    expect(renderer.activeCount).toBe(2);
    expect(stage.querySelectorAll('.c')).toHaveLength(2);
  });

  it('positions scrolling comments by time', () => {
    renderer.setComments([c(0)]);
    renderer.frame(0, 1000, 500);
    const el = stage.querySelector<HTMLElement>('.c')!;
    expect(el.style.transform).toBe('translateX(1000px)');
    renderer.frame(1, 1000, 500);
    expect(el.style.transform).toBe('translateX(862.5px)');
  });

  it('removes comments after they cross', () => {
    renderer.setComments([c(0)]);
    renderer.frame(0, 1000, 500);
    for (let t = 0.5; t <= 8; t += 0.5) renderer.frame(t, 1000, 500);
    expect(renderer.activeCount).toBe(0);
    expect(stage.childElementCount).toBe(0);
  });

  it('keeps top comments for 4 seconds', () => {
    renderer.setComments([c(0, 'top')]);
    renderer.frame(0, 1000, 500);
    expect(stage.querySelector('.c.fixed')).not.toBeNull();
    for (let t = 0.5; t < 4; t += 0.5) renderer.frame(t, 1000, 500);
    expect(renderer.activeCount).toBe(1);
    renderer.frame(4, 1000, 500);
    expect(renderer.activeCount).toBe(0);
  });

  it('brings comments back after seeking backwards', () => {
    renderer.setComments([c(0), c(1)]);
    renderer.frame(1.5, 1000, 500);
    renderer.frame(30, 1000, 500);
    expect(renderer.activeCount).toBe(0);
    renderer.frame(1.5, 1000, 500);
    expect(renderer.activeCount).toBe(2);
  });

  it('shows comments already in flight after a forward seek', () => {
    renderer.setComments([c(10)]);
    renderer.frame(0, 1000, 500);
    renderer.frame(12, 1000, 500);
    expect(renderer.activeCount).toBe(1);
  });

  it('caps comments on screen at 150', () => {
    renderer.setComments(Array.from({ length: 200 }, () => c(0)));
    renderer.frame(0, 1000, 10_000);
    expect(renderer.activeCount).toBe(150);
  });

  it('draws nothing when the stage has no height', () => {
    renderer.setComments([c(0)]);
    expect(() => renderer.frame(0, 0, 0)).not.toThrow();
    expect(renderer.activeCount).toBe(0);
  });

  it('draws nothing before the first comment (negative offset)', () => {
    renderer.setComments([c(0)]);
    renderer.frame(-3, 1000, 500);
    expect(renderer.activeCount).toBe(0);
  });

  it('clear empties the stage and the next frame restores it', () => {
    renderer.setComments([c(0)]);
    renderer.frame(1, 1000, 500);
    renderer.clear();
    expect(stage.childElementCount).toBe(0);
    renderer.frame(1.01, 1000, 500);
    expect(renderer.activeCount).toBe(1);
  });

  it('applies opacity and font scale to the stage', () => {
    renderer.setSettings({ ...DEFAULT_SETTINGS, opacity: 0.5, fontScale: 2 });
    expect(stage.style.opacity).toBe('0.5');
    expect(stage.style.fontSize).toBe('50px');
  });

  it('frees cap room from expiring comments before spawning new ones', () => {
    const late: Comment = { time: 8, text: 'late', mode: 'scroll', color: '#ffffff' };
    renderer.setComments([...Array.from({ length: 150 }, () => c(0)), late]);
    renderer.frame(0, 1000, 10_000);
    for (let t = 0.5; t <= 8; t += 0.5) renderer.frame(t, 1000, 10_000);
    expect([...stage.querySelectorAll('.c')].map((e) => e.textContent)).toEqual(['late']);
  });

  it('keeps comments on screen when only the opacity changes', () => {
    renderer.setComments([c(0)]);
    renderer.frame(1, 1000, 500);
    renderer.setSettings({ ...DEFAULT_SETTINGS, opacity: 0.4 });
    expect(renderer.activeCount).toBe(1);
    expect(stage.style.opacity).toBe('0.4');
  });
});
