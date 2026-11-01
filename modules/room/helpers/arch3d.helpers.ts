import type {
  OpeningElement,
  Vec2,
  WallElement,
} from "@/common/types/elements";

import { dist } from "./arch.helpers";

export const DOOR_HEIGHT = 210; // 2.1 m in px
export const WINDOW_HEIGHT = 120; // 1.2 m in px

export interface SegOpening {
  offset: number; // local offset within this segment
  width: number;
  kind: "door" | "window";
  sill: number;
}

export interface WallSeg {
  start: Vec2;
  angle: number;
  length: number;
  openings: SegOpening[];
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

// Split a wall polyline into straight segments, distributing openings
// onto the segment they belong to (by offset along the whole path).
export const wallSegments = (
  wall: WallElement,
  openings: OpeningElement[]
): WallSeg[] => {
  const segs: WallSeg[] = [];
  const bounds: { start: number; end: number }[] = [];
  let acc = 0;

  for (let i = 0; i < wall.path.length - 1; i += 1) {
    const a = wall.path[i];
    const b = wall.path[i + 1];
    const len = dist(a, b);
    if (len === 0) continue;
    segs.push({
      start: a,
      angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
      length: len,
      openings: [],
    });
    bounds.push({ start: acc, end: acc + len });
    acc += len;
  }

  openings.forEach((o) => {
    for (let i = 0; i < segs.length; i += 1) {
      const { start, end } = bounds[i];
      if (o.offset >= start && o.offset < end) {
        segs[i].openings.push({
          offset: o.offset - start,
          width: o.width,
          kind: o.type,
          sill: o.sillHeight ?? 90,
        });
        break;
      }
    }
  });

  return segs;
};

// Decompose one straight wall segment into solid boxes: full-height pieces
// between openings, lintels above doors, sills below and headers above windows.
export const segmentBoxes = (
  length: number,
  height: number,
  openings: SegOpening[]
): Box[] => {
  const boxes: Box[] = [];
  const sorted = [...openings].sort((a, b) => a.offset - b.offset);
  let cursor = 0;

  sorted.forEach((o) => {
    const x0 = Math.max(0, o.offset - o.width / 2);
    const x1 = Math.min(length, o.offset + o.width / 2);
    if (x0 <= x1) {
      if (x0 > cursor) boxes.push({ x0: cursor, x1: x0, y0: 0, y1: height });

      if (o.kind === "door") {
        if (height > DOOR_HEIGHT) {
          boxes.push({ x0, x1, y0: DOOR_HEIGHT, y1: height });
        }
      } else {
        const sill = Math.min(o.sill, height);
        const top = Math.min(sill + WINDOW_HEIGHT, height);
        if (sill > 0) boxes.push({ x0, x1, y0: 0, y1: sill });
        if (top < height) boxes.push({ x0, x1, y0: top, y1: height });
      }
      cursor = Math.max(cursor, x1);
    }
  });

  if (cursor < length) boxes.push({ x0: cursor, x1: length, y0: 0, y1: height });
  return boxes;
};
