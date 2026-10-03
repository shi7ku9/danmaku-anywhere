import type { Bindings } from '../../core/types';

export interface PageUse {
  urlKey: string;
  title: string;
}

/** The pages bound to a danmaku, in binding order. */
export function pagesUsing(bindings: Bindings, danmakuId: string): PageUse[] {
  return Object.entries(bindings)
    .filter(([, binding]) => binding.danmakuId === danmakuId)
    .map(([urlKey, binding]) => ({ urlKey, title: binding.title }));
}

const pages = (n: number) => (n === 1 ? '1 page' : `${n} pages`);

/** "Used by 2 pages"; empty when no page uses the danmaku. */
export function usedByLabel(n: number): string {
  return n === 0 ? '' : `Used by ${pages(n)}`;
}

/** The delete button once armed: it names what else the deletion removes. */
export function deleteLabel(n: number): string {
  return n === 0 ? 'Delete?' : `Delete? Unbinds ${pages(n)}`;
}
