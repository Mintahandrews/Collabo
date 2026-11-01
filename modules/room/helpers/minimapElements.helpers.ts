import { getStringFromRgba } from "@/common/lib/rgba";
import type { ElementsState } from "@/common/recoil/elements";
import type {
  DesignElement,
  OpeningElement,
  Vec2,
  WallElement,
} from "@/common/types/elements";

import {
  polylineLength,
  slicePolyline,
  solidIntervals,
} from "./arch.helpers";

const quad = (ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2, t: number) => {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const nx = -Math.sin(ang) * (t / 2);
  const ny = Math.cos(ang) * (t / 2);
  ctx.beginPath();
  ctx.moveTo(a[0] + nx, a[1] + ny);
  ctx.lineTo(b[0] + nx, b[1] + ny);
  ctx.lineTo(b[0] - nx, b[1] - ny);
  ctx.lineTo(a[0] - nx, a[1] - ny);
  ctx.closePath();
  ctx.fill();
};

const drawWall = (
  ctx: CanvasRenderingContext2D,
  wall: WallElement,
  openings: OpeningElement[]
) => {
  const len = polylineLength(wall.path);
  solidIntervals(
    len,
    openings.map((o) => ({ offset: o.offset, width: o.width }))
  ).forEach(([from, to]) => {
    const piece = slicePolyline(wall.path, from, to);
    for (let i = 0; i < piece.length - 1; i += 1) {
      quad(ctx, piece[i], piece[i + 1], wall.thickness);
    }
  });
};

const strokePath = (
  ctx: CanvasRenderingContext2D,
  path: Vec2[],
  width: number
) => {
  ctx.beginPath();
  ctx.moveTo(path[0][0], path[0][1]);
  path.forEach((p) => ctx.lineTo(p[0], p[1]));
  ctx.lineWidth = Math.max(width, 4);
  ctx.stroke();
};

const drawElement = (
  ctx: CanvasRenderingContext2D,
  el: DesignElement,
  openingsByWall: Record<string, OpeningElement[]>
) => {
  switch (el.type) {
    case "wall":
      ctx.fillStyle = "#1f2937";
      drawWall(ctx, el, openingsByWall[el.id] || []);
      break;
    case "dimension":
      ctx.strokeStyle = "#6b7280";
      strokePath(ctx, [el.from, el.to], 3);
      break;
    case "stroke":
      ctx.strokeStyle = getStringFromRgba(el.color);
      strokePath(ctx, el.path, el.lineWidth);
      break;
    case "line":
      ctx.strokeStyle = getStringFromRgba(el.color);
      strokePath(ctx, [el.from, el.to], el.lineWidth);
      break;
    case "rect":
      ctx.strokeStyle = getStringFromRgba(el.color);
      strokePath(
        ctx,
        [el.from, [el.to[0], el.from[1]], el.to, [el.from[0], el.to[1]], el.from],
        el.lineWidth
      );
      break;
    case "ellipse": {
      const cx = (el.from[0] + el.to[0]) / 2;
      const cy = (el.from[1] + el.to[1]) / 2;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy,
        Math.abs(el.to[0] - el.from[0]) / 2,
        Math.abs(el.to[1] - el.from[1]) / 2,
        0,
        0,
        2 * Math.PI
      );
      ctx.strokeStyle = getStringFromRgba(el.color);
      ctx.lineWidth = Math.max(el.lineWidth, 4);
      ctx.stroke();
      break;
    }
    case "room":
      ctx.strokeStyle = "#0891b2";
      strokePath(ctx, [...el.polygon, el.polygon[0]], 3);
      break;
    // openings appear as gaps in their wall; nothing extra at minimap scale
    case "door":
    case "window":
    default:
      break;
  }
};

// Renders arch elements on top of the minimap's scaled canvas copy.
export const drawElementsOnMinimap = (
  ctx: CanvasRenderingContext2D,
  elements: ElementsState
) => {
  const openingsByWall: Record<string, OpeningElement[]> = {};

  elements.order.forEach((id) => {
    const el = elements.byId[id];
    if (el && (el.type === "door" || el.type === "window")) {
      (openingsByWall[el.wallId] ||= []).push(el);
    }
  });

  ctx.save();
  elements.order.forEach((id) => {
    const el = elements.byId[id];
    if (el) drawElement(ctx, el, openingsByWall);
  });
  ctx.restore();
};
