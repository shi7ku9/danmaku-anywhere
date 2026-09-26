/** Index of the first comment with time >= t. `comments` must be sorted by time. */
export function lowerBound(comments: readonly { time: number }[], t: number): number {
  let lo = 0;
  let hi = comments.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (comments[mid]!.time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
