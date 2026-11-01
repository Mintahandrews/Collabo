import type { Vec2 } from "@/common/types/elements";
import { AXIS_SNAP_TOLERANCE } from "@/common/constants/arch";

export const dist = (a: Vec2, b: Vec2) =>
  Math.hypot(b[0] - a[0], b[1] - a[1]);

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

export const polylineLength = (path: Vec2[]) => {
  let length = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    length += dist(path[i], path[i + 1]);
  }
  return length;
};

// Point and direction angle at a given distance along a polyline.
export const pointAtLength = (
  path: Vec2[],
  d: number
): { point: Vec2; angle: number } => {
  let acc = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const segLen = dist(a, b);
    if (acc + segLen >= d && segLen > 0) {
      const t = (d - acc) / segLen;
      return {
        point: lerp(a, b, t),
        angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
      };
    }
    acc += segLen;
  }
  const last = path[path.length - 1];
  const prev = path[path.length - 2] || last;
  return {
    point: last,
    angle: Math.atan2(last[1] - prev[1], last[0] - prev[0]),
  };
};

export interface Projection {
  point: Vec2;
  offset: number; // distance along the polyline
  distance: number; // distance from p to the polyline
}

// Closest point on a polyline to a given point.
export const projectOntoPolyline = (path: Vec2[], p: Vec2): Projection => {
  let best: Projection = { point: path[0], offset: 0, distance: Infinity };
  let acc = 0;

  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const segLen = dist(a, b);
    if (segLen === 0) continue;

    const dx = (b[0] - a[0]) / segLen;
    const dy = (b[1] - a[1]) / segLen;
    const t = Math.max(
      0,
      Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / segLen)
    );
    const candidate: Vec2 = [a[0] + dx * t * segLen, a[1] + dy * t * segLen];
    const distance = dist(p, candidate);

    if (distance < best.distance) {
      best = { point: candidate, offset: acc + t * segLen, distance };
    }
    acc += segLen;
  }

  return best;
};

// Extract the sub-polyline between distances `from` and `to` along the path.
export const slicePolyline = (
  path: Vec2[],
  from: number,
  to: number
): Vec2[] => {
  const out: Vec2[] = [];
  let acc = 0;

  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const segLen = dist(a, b);
    const segStart = acc;
    const segEnd = acc + segLen;
    const s = Math.max(from, segStart);
    const e = Math.min(to, segEnd);

    if (segLen > 0 && e > s) {
      const p0 = lerp(a, b, (s - segStart) / segLen);
      const p1 = lerp(a, b, (e - segStart) / segLen);
      const prev = out[out.length - 1];
      if (!prev || dist(prev, p0) > 0.5) out.push(p0);
      out.push(p1);
    }
    acc = segEnd;
  }

  return out;
};

// Given openings (offset + width) along a wall, return the solid intervals
// of the wall that should be drawn (the openings cut gaps).
export const solidIntervals = (
  length: number,
  openings: { offset: number; width: number }[]
): [number, number][] => {
  const cuts = openings
    .map(({ offset, width }) => ({
      start: Math.max(0, offset - width / 2),
      end: Math.min(length, offset + width / 2),
    }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);

  const intervals: [number, number][] = [];
  let cursor = 0;

  cuts.forEach(({ start, end }) => {
    if (start > cursor) intervals.push([cursor, start]);
    cursor = Math.max(cursor, end);
  });
  if (cursor < length) intervals.push([cursor, length]);

  return intervals;
};

interface SnapOptions {
  gridOn: boolean;
  gridSize: number;
  snapRadius: number;
  endpoints: Vec2[];
  axisFrom?: Vec2;
}

// Snap a point to wall endpoints, to the axis of the previous point
// (when shift is held), or to the grid.
export const snapPoint = (p: Vec2, opts: SnapOptions): Vec2 => {
  const { endpoints, snapRadius, axisFrom, gridOn, gridSize } = opts;

  let best: Vec2 | null = null;
  let bestDist = snapRadius;
  endpoints.forEach((e) => {
    const d = dist(p, e);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  });
  if (best) return best;

  if (axisFrom) {
    const dx = Math.abs(p[0] - axisFrom[0]);
    const dy = Math.abs(p[1] - axisFrom[1]);
    if (dx < AXIS_SNAP_TOLERANCE) return [axisFrom[0], p[1]];
    if (dy < AXIS_SNAP_TOLERANCE) return [p[0], axisFrom[1]];
  }

  if (gridOn) {
    return [
      Math.round(p[0] / gridSize) * gridSize,
      Math.round(p[1] / gridSize) * gridSize,
    ];
  }

  return p;
};
