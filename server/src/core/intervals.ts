// Small helpers for working with time ranges.
// An Interval is [start, end) in epoch milliseconds (UTC). Using plain numbers
// keeps the maths fast and the planner easy to test.

export interface Interval {
  start: number;
  end: number;
}

/** Sort and merge overlapping or touching intervals. Drops empty ones. */
export function normalize(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** Everything in `base` that is not covered by `cut`. */
export function subtract(base: Interval[], cut: Interval[]): Interval[] {
  const cuts = normalize(cut);
  const out: Interval[] = [];
  for (const b of normalize(base)) {
    let pieces: Interval[] = [b];
    for (const c of cuts) {
      const next: Interval[] = [];
      for (const p of pieces) {
        if (c.end <= p.start || c.start >= p.end) {
          next.push(p);
          continue;
        }
        if (c.start > p.start) next.push({ start: p.start, end: c.start });
        if (c.end < p.end) next.push({ start: c.end, end: p.end });
      }
      pieces = next;
    }
    out.push(...pieces);
  }
  return out;
}

/** Only the time that is inside both lists. */
export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of normalize(a)) {
    for (const y of normalize(b)) {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      if (end > start) out.push({ start, end });
    }
  }
  return normalize(out);
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Grow every interval by `ms` on both sides (used for the buffer around events). */
export function pad(list: Interval[], ms: number): Interval[] {
  return list.map((i) => ({ start: i.start - ms, end: i.end + ms }));
}
