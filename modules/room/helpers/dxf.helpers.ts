import type { ElementsState } from "@/common/recoil/elements";
import type {
  DesignElement,
  OpeningElement,
  Vec2,
  WallElement,
} from "@/common/types/elements";
import { PX_PER_METER } from "@/common/constants/arch";

import {
  pointAtLength,
  polylineLength,
  slicePolyline,
  solidIntervals,
} from "./arch.helpers";

// DXF is unitless; we export in millimetres (1 canvas px = 10 mm at 100px/m).
const S = 1000 / PX_PER_METER;

const deg = (rad: number) => (rad * 180) / Math.PI;

// CAD uses y-up; canvas is y-down -> negate y.
const pt = (p: Vec2): [number, number] => [p[0] * S, -p[1] * S];

const e = (...lines: (string | number)[]) => lines.join("\n");

const lwpolyline = (layer: string, pts: Vec2[], closed: boolean) =>
  e(
    "0",
    "LWPOLYLINE",
    "8",
    layer,
    "90",
    pts.length,
    "70",
    closed ? 1 : 0,
    ...pts.flatMap((p) => {
      const [x, y] = pt(p);
      return ["10", x.toFixed(3), "20", y.toFixed(3)];
    })
  );

const line = (layer: string, a: Vec2, b: Vec2) => {
  const [x1, y1] = pt(a);
  const [x2, y2] = pt(b);
  return e(
    "0",
    "LINE",
    "8",
    layer,
    "10",
    x1.toFixed(3),
    "20",
    y1.toFixed(3),
    "11",
    x2.toFixed(3),
    "21",
    y2.toFixed(3)
  );
};

const arc = (
  layer: string,
  center: Vec2,
  radius: number,
  startDeg: number,
  endDeg: number
) => {
  const [x, y] = pt(center);
  return e(
    "0",
    "ARC",
    "8",
    layer,
    "10",
    x.toFixed(3),
    "20",
    y.toFixed(3),
    "40",
    (radius * S).toFixed(3),
    "50",
    startDeg.toFixed(3),
    "51",
    endDeg.toFixed(3)
  );
};

const text = (
  layer: string,
  at: Vec2,
  height: number,
  value: string,
  rotationDeg: number
) => {
  const [x, y] = pt(at);
  return e(
    "0",
    "TEXT",
    "8",
    layer,
    "10",
    x.toFixed(3),
    "20",
    y.toFixed(3),
    "40",
    (height * S).toFixed(3),
    "1",
    value,
    "50",
    rotationDeg.toFixed(3)
  );
};

// Draw a straight piece of wall (a..b with thickness) as a closed quad.
const wallQuad = (layer: string, a: Vec2, b: Vec2, thickness: number) => {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const nx = -Math.sin(ang) * (thickness / 2);
  const ny = Math.cos(ang) * (thickness / 2);
  const pts: Vec2[] = [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ];
  return lwpolyline(layer, pts, true);
};

const wallEntities = (wall: WallElement, openings: OpeningElement[]) => {
  const out: string[] = [];
  const len = polylineLength(wall.path);
  const intervals = solidIntervals(
    len,
    openings.map((o) => ({ offset: o.offset, width: o.width }))
  );

  intervals.forEach(([from, to]) => {
    const piece = slicePolyline(wall.path, from, to);
    for (let i = 0; i < piece.length - 1; i += 1) {
      out.push(wallQuad("WALL", piece[i], piece[i + 1], wall.thickness));
    }
  });

  return out;
};

const doorEntities = (door: OpeningElement, wall: WallElement) => {
  const half = door.width / 2;
  const start = pointAtLength(wall.path, door.offset - half);
  const ang = start.angle;
  const nx = -Math.sin(ang);
  const ny = Math.cos(ang);
  const hinge = start.point;
  const leafEnd: Vec2 = [hinge[0] + nx * door.width, hinge[1] + ny * door.width];

  return [
    line("DOOR", hinge, leafEnd),
    // screen sweep θ->θ+90 becomes CAD sweep -(θ+90)->-θ (y flipped)
    arc("DOOR", hinge, door.width, -deg(ang) - 90, -deg(ang)),
  ];
};

const windowEntities = (win: OpeningElement, wall: WallElement) => {
  const half = win.width / 2;
  const start = pointAtLength(wall.path, win.offset - half);
  const end = pointAtLength(wall.path, win.offset + half);
  const ang = start.angle;
  const nx = -Math.sin(ang);
  const ny = Math.cos(ang);
  const h = wall.thickness / 2;

  const edge = (side: 1 | -1) =>
    line(
      "WINDOW",
      [start.point[0] + nx * h * side, start.point[1] + ny * h * side],
      [end.point[0] + nx * h * side, end.point[1] + ny * h * side]
    );
  const cap = (p: Vec2) =>
    line(
      "WINDOW",
      [p[0] + nx * h, p[1] + ny * h],
      [p[0] - nx * h, p[1] - ny * h]
    );

  return [edge(1), edge(-1), cap(start.point), cap(end.point)];
};

const dimensionEntities = (el: Extract<DesignElement, { type: "dimension" }>) => {
  const { from, to, offset } = el;
  const ang = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const nx = -Math.sin(ang);
  const ny = Math.cos(ang);
  const dimFrom: Vec2 = [from[0] + nx * offset, from[1] + ny * offset];
  const dimTo: Vec2 = [to[0] + nx * offset, to[1] + ny * offset];
  const meters = (
    Math.hypot(to[0] - from[0], to[1] - from[1]) / PX_PER_METER
  ).toFixed(2);

  return [
    line("DIM", from, dimFrom),
    line("DIM", to, dimTo),
    line("DIM", dimFrom, dimTo),
    text(
      "DIM",
      [(dimFrom[0] + dimTo[0]) / 2, (dimFrom[1] + dimTo[1]) / 2 - 10],
      14,
      `${meters} m`,
      -deg(ang)
    ),
  ];
};

const elementEntities = (
  el: DesignElement,
  wallsById: Record<string, WallElement>
): string[] => {
  switch (el.type) {
    case "wall":
      return []; // handled in pass over walls (needs openings)
    case "door":
    case "window": {
      const wall = wallsById[el.wallId];
      if (!wall) return [];
      return el.type === "door"
        ? doorEntities(el, wall)
        : windowEntities(el, wall);
    }
    case "dimension":
      return dimensionEntities(el);
    case "stroke":
      return [lwpolyline("SKETCH", el.path, false)];
    case "line":
      return [line("SKETCH", el.from, el.to)];
    case "rect":
      return [
        lwpolyline(
          "SKETCH",
          [el.from, [el.to[0], el.from[1]], el.to, [el.from[0], el.to[1]]],
          true
        ),
      ];
    case "ellipse": {
      const cx = (el.from[0] + el.to[0]) / 2;
      const cy = (el.from[1] + el.to[1]) / 2;
      const rx = Math.abs(el.to[0] - el.from[0]) / 2;
      const ry = Math.abs(el.to[1] - el.from[1]) / 2;
      const pts: Vec2[] = Array.from({ length: 32 }, (_, i) => {
        const t = (i / 32) * Math.PI * 2;
        return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
      });
      return [lwpolyline("SKETCH", pts, true)];
    }
    case "text":
      return [text("SKETCH", el.at, el.fontSize, el.text, 0)];
    case "room":
      return [
        lwpolyline("ROOM", el.polygon, true),
        text("ROOM", el.polygon[0], 20, el.name, 0),
      ];
    default:
      return [];
  }
};

export const buildDxf = (elements: ElementsState): string => {
  const all = elements.order
    .map((id) => elements.byId[id])
    .filter((el): el is DesignElement => !!el);

  const wallsById: Record<string, WallElement> = {};
  const openingsByWall: Record<string, OpeningElement[]> = {};

  all.forEach((el) => {
    if (el.type === "wall") wallsById[el.id] = el;
  });
  all.forEach((el) => {
    if (el.type === "door" || el.type === "window") {
      (openingsByWall[el.wallId] ||= []).push(el);
    }
  });

  const entities: string[] = [];

  Object.values(wallsById).forEach((wall) => {
    entities.push(...wallEntities(wall, openingsByWall[wall.id] || []));
  });
  all.forEach((el) => entities.push(...elementEntities(el, wallsById)));

  const layers = ["WALL", "DOOR", "WINDOW", "DIM", "ROOM", "SKETCH"];
  const layerTable = layers.map((l) =>
    e("0", "LAYER", "2", l, "70", 0, "62", 7, "6", "CONTINUOUS")
  );

  return [
    e("0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", "0", "ENDSEC"),
    e(
      "0",
      "SECTION",
      "2",
      "TABLES",
      "0",
      "TABLE",
      "2",
      "LAYER",
      "70",
      layers.length,
      layerTable.join("\n"),
      "0",
      "ENDTAB",
      "0",
      "ENDSEC"
    ),
    e("0", "SECTION", "2", "ENTITIES", entities.join("\n"), "0", "ENDSEC"),
    "0\nEOF",
  ].join("\n");
};
