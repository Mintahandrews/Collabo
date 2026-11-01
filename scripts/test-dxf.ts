// Verifies the DXF exporter produces a structurally valid file.
// Run: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-dxf.ts

import fs from "fs";

import { buildDxf } from "../modules/room/helpers/dxf.helpers";
import type { ElementsState } from "../common/recoil/elements";
import type { DesignElement } from "../common/types/elements";

const wall: DesignElement = {
  id: "w1",
  type: "wall",
  path: [
    [100, 100],
    [700, 100],
  ],
  thickness: 30,
  height: 280,
};

const door: DesignElement = {
  id: "d1",
  type: "door",
  wallId: "w1",
  offset: 300,
  width: 90,
};

const win: DesignElement = {
  id: "w2",
  type: "window",
  wallId: "w1",
  offset: 520,
  width: 120,
  sillHeight: 90,
};

const dim: DesignElement = {
  id: "dim1",
  type: "dimension",
  from: [100, 100],
  to: [700, 100],
  offset: 40,
};

const elements: ElementsState = {
  order: ["w1", "d1", "w2", "dim1"],
  byId: { w1: wall, d1: door, w2: win, dim1: dim },
};

const dxf = buildDxf(elements);

const checks: [string, boolean][] = [
  ["has ENTITIES section", dxf.includes("SECTION\n2\nENTITIES")],
  ["ends with EOF", dxf.trimEnd().endsWith("EOF")],
  [
    "wall split into 3 quads by openings",
    (dxf.match(/LWPOLYLINE/g) || []).length === 3,
  ],
  ["door leaf line on DOOR layer", dxf.includes("LINE\n8\nDOOR")],
  ["door swing arc", dxf.includes("ARC\n8\nDOOR")],
  ["window lines on WINDOW layer", (dxf.match(/LINE\n8\nWINDOW/g) || []).length === 4],
  ["dimension label text", dxf.includes("TEXT\n8\nDIM") && dxf.includes("6.00 m")],
  ["layers table present", dxf.includes("TABLE\n2\nLAYER")],
  ["coordinates in mm", dxf.includes("7000.000") || dxf.includes("7000")],
];

let failed = 0;
checks.forEach(([name, ok]) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
});

fs.writeFileSync("/tmp/plan.dxf", dxf);
console.log(`\n${checks.length - failed}/${checks.length} checks passed — sample written to /tmp/plan.dxf`);
process.exit(failed ? 1 : 0);
