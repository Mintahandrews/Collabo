// Verifies the IFC exporter produces a structurally valid IFC-2x3 file.
// Run: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-ifc.ts

import fs from "fs";

import { buildIfc } from "../modules/room/helpers/ifc.helpers";
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

const elements: ElementsState = {
  order: ["w1", "d1", "w2"],
  byId: { w1: wall, d1: door, w2: win },
};

const ifc = buildIfc(elements);

// Wall decomposes into: 3 full-height runs + door lintel + window sill + window header = 6 boxes
const wallCount = (ifc.match(/IFCWALLSTANDARDCASE/g) || []).length;
const doorCount = (ifc.match(/IFCDOOR\(/g) || []).length;
const windowCount = (ifc.match(/IFCWINDOW\(/g) || []).length;

// Every #N referenced must be defined exactly once
const defined = new Set<number>();
(ifc.match(/#(\d+)=/g) || []).forEach((m) => defined.add(+m.slice(1, -1)));
const referenced = new Set<number>();
(ifc.match(/#(\d+)/g) || []).forEach((m) => {
  const id = +m.slice(1);
  if (!ifc.includes(`#${id}=`)) referenced.add(id);
});
const dangling = [...referenced].filter((id) => !defined.has(id));

// GUIDs: quoted 22-char strings in the IFC charset
const guids = ifc.match(/'([0-9A-Za-z_$]{22})'/g) || [];
const guidOk = guids.every((g) => /^'[0-3][0-9A-Za-z_$]{21}'$/.test(g));

const checks: [string, boolean][] = [
  ["STEP header present", ifc.startsWith("ISO-10303-21;\nHEADER;")],
  ["IFC2X3 schema declared", ifc.includes("FILE_SCHEMA(('IFC2X3'))")],
  ["ends with END-ISO-10303-21", ifc.trimEnd().endsWith("END-ISO-10303-21;")],
  ["wall boxes emitted (6)", wallCount === 6],
  ["one door", doorCount === 1],
  ["one window", windowCount === 1],
  ["spatial chain present", ifc.includes("IFCBUILDINGSTOREY") && ifc.includes("IFCSITE") && ifc.includes("IFCPROJECT")],
  ["containment relation", ifc.includes("IFCRELCONTAINEDINSPATIALSTRUCTURE")],
  ["mm units declared", ifc.includes(".MILLI.,.METRE.")],
  ["no dangling refs", dangling.length === 0],
  ["guids valid (22 chars, 0-3 first)", guids.length > 10 && guidOk],
  ["geometry present", ifc.includes("IFCEXTRUDEDAREASOLID") && ifc.includes("IFCRECTANGLEPROFILEDEF")],
];

let failed = 0;
checks.forEach(([name, ok]) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
});
if (dangling.length) console.log("dangling refs:", dangling);

fs.writeFileSync("/tmp/design.ifc", ifc);
console.log(
  `\n${checks.length - failed}/${checks.length} checks passed — sample written to /tmp/design.ifc`
);
process.exit(failed ? 1 : 0);
