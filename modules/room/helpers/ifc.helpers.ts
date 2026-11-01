import { v4 } from "uuid";

import { PX_PER_METER } from "@/common/constants/arch";
import type { ElementsState } from "@/common/recoil/elements";
import type {
  DesignElement,
  OpeningElement,
  Vec2,
  WallElement,
} from "@/common/types/elements";

import {
  DOOR_HEIGHT,
  segmentBoxes,
  wallSegments,
  WINDOW_HEIGHT,
} from "./arch3d.helpers";

// Canvas px -> IFC millimetres
const MM = 1000 / PX_PER_METER;
const mm = (px: number) => +(px * MM).toFixed(4);

const IFC_CHARS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

// IFC compressed 22-char GlobalId (128-bit uuid -> base64).
// First char is automatically 0-3 since 2^128 < 4 * 64^21.
const ifcGuid = (): string => {
  let num = BigInt(`0x${v4().replace(/-/g, "")}`);
  let out = "";
  for (let i = 0; i < 22; i += 1) {
    out = IFC_CHARS[Number(num % BigInt(64))] + out;
    num /= BigInt(64);
  }
  return out;
};

class IfcWriter {
  private nextId = 1;

  private lines: string[] = [];

  add(body: string): number {
    const id = this.nextId;
    this.nextId += 1;
    this.lines.push(`#${id}=${body};`);
    return id;
  }

  ref(id: number) {
    return `#${id}`;
  }

  body() {
    return this.lines.join("\n");
  }
}

// Shared geometry: swept box (rect profile in XY extruded along Z)
// centered at `center`, x-axis along `dir` (plan direction, y-negated).
// Returns [placementId, defShapeId]
const addBoxProductShape = (
  w: IfcWriter,
  center: Vec2,
  dirAngle: number,
  lenPx: number,
  depthPx: number,
  heightPx: number,
  elevPx: number,
  contextId: number
): [number, number] => {
  const ux = Math.cos(dirAngle);
  const uy = -Math.sin(dirAngle);

  const point = w.add(
    `IFCCARTESIANPOINT((${mm(center[0])},${mm(-center[1])},${mm(elevPx)}))`
  );
  const zDir = w.add(`IFCDIRECTION((0.,0.,1.))`);
  const xDir = w.add(`IFCDIRECTION((${ux},${uy},0.))`);
  const placement3d = w.add(
    `IFCAXIS2PLACEMENT3D(${w.ref(point)},${w.ref(zDir)},${w.ref(xDir)})`
  );

  const profOrigin = w.add(`IFCCARTESIANPOINT((0.,0.))`);
  const profDir = w.add(`IFCDIRECTION((1.,0.))`);
  const profPlacement = w.add(
    `IFCAXIS2PLACEMENT2D(${w.ref(profOrigin)},${w.ref(profDir)})`
  );
  const profile = w.add(
    `IFCRECTANGLEPROFILEDEF(.AREA.,$,${w.ref(profPlacement)},${mm(
      lenPx
    )},${mm(depthPx)})`
  );

  const solidOrigin = w.add(`IFCCARTESIANPOINT((0.,0.,0.))`);
  const solidPlacement = w.add(
    `IFCAXIS2PLACEMENT3D(${w.ref(solidOrigin)},$,$)`
  );
  const solid = w.add(
    `IFCEXTRUDEDAREASOLID(${w.ref(profile)},${w.ref(solidPlacement)},${w.ref(
      zDir
    )},${mm(heightPx)})`
  );

  const shapeRep = w.add(
    `IFCSHAPEREPRESENTATION(${w.ref(contextId)},'Body','SweptSolid',(${w.ref(
      solid
    )}))`
  );
  const defShape = w.add(
    `IFCPRODUCTDEFINITIONSHAPE($,$,(${w.ref(shapeRep)}))`
  );
  const localPlacement = w.add(`IFCLOCALPLACEMENT($,${w.ref(placement3d)})`);

  return [localPlacement, defShape];
};

export const buildIfc = (
  elements: ElementsState,
  projectName = "Collabo Design"
): string => {
  const w = new IfcWriter();
  const ts = Math.floor(Date.now() / 1000);

  // --- owner history + project context ---
  const person = w.add(`IFCPERSON($,$,'Collabo User',$,$,$,$,$)`);
  const org = w.add(`IFCORGANIZATION($,'Collabo',$,$,$)`);
  const personOrg = w.add(
    `IFCPERSONANDORGANIZATION(${w.ref(person)},${w.ref(org)},$)`
  );
  const app = w.add(`IFCAPPLICATION(${w.ref(org)},'1.0','Collabo','Collabo')`);
  const owner = w.add(
    `IFCOWNERHISTORY(${w.ref(personOrg)},${w.ref(app)},$,.ADDED.,$,${w.ref(
      personOrg
    )},${w.ref(app)},${ts})`
  );

  const originPt = w.add(`IFCCARTESIANPOINT((0.,0.,0.))`);
  const rootPlacement3d = w.add(`IFCAXIS2PLACEMENT3D(${w.ref(originPt)},$,$)`);
  const trueNorth = w.add(`IFCDIRECTION((0.,1.,0.))`);
  const context = w.add(
    `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${w.ref(
      rootPlacement3d
    )},${w.ref(trueNorth)})`
  );

  const lenUnit = w.add(`IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)`);
  const areaUnit = w.add(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`);
  const volUnit = w.add(`IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`);
  const angUnit = w.add(`IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)`);
  const units = w.add(
    `IFCUNITASSIGNMENT((${w.ref(lenUnit)},${w.ref(areaUnit)},${w.ref(
      volUnit
    )},${w.ref(angUnit)}))`
  );

  const project = w.add(
    `IFCPROJECT('${ifcGuid()}',${w.ref(owner)},'${projectName}',$,$,$,$,(${w.ref(
      context
    )}),${w.ref(units)})`
  );

  // --- spatial structure: project -> site -> building -> storey ---
  const sitePlacement = w.add(
    `IFCLOCALPLACEMENT($,${w.ref(rootPlacement3d)})`
  );
  const site = w.add(
    `IFCSITE('${ifcGuid()}',${w.ref(owner)},'Site',$,$,${w.ref(
      sitePlacement
    )},$,$,.ELEMENT.,$,$,$,$,$)`
  );

  const bldPlacement = w.add(
    `IFCLOCALPLACEMENT(${w.ref(sitePlacement)},${w.ref(rootPlacement3d)})`
  );
  const building = w.add(
    `IFCBUILDING('${ifcGuid()}',${w.ref(owner)},'Building',$,$,${w.ref(
      bldPlacement
    )},$,$,.ELEMENT.,$,$,$)`
  );

  const storeyPlacement = w.add(
    `IFCLOCALPLACEMENT(${w.ref(bldPlacement)},${w.ref(rootPlacement3d)})`
  );
  const storey = w.add(
    `IFCBUILDINGSTOREY('${ifcGuid()}',${w.ref(
      owner
    )},'Ground Floor',$,$,${w.ref(storeyPlacement)},$,$,.ELEMENT.,0.)`
  );

  w.add(
    `IFCRELAGGREGATES('${ifcGuid()}',${w.ref(owner)},$,$,${w.ref(project)},(${w.ref(
      site
    )}))`
  );
  w.add(
    `IFCRELAGGREGATES('${ifcGuid()}',${w.ref(owner)},$,$,${w.ref(site)},(${w.ref(
      building
    )}))`
  );
  w.add(
    `IFCRELAGGREGATES('${ifcGuid()}',${w.ref(owner)},$,$,${w.ref(
      building
    )},(${w.ref(storey)}))`
  );

  // --- collect elements ---
  const all = elements.order
    .map((id) => elements.byId[id])
    .filter((el): el is DesignElement => !!el);

  const walls = all.filter((el): el is WallElement => el.type === "wall");
  const openingsByWall: Record<string, OpeningElement[]> = {};
  all.forEach((el) => {
    if (el.type === "door" || el.type === "window") {
      (openingsByWall[el.wallId] ||= []).push(el);
    }
  });

  const products: number[] = [];
  let wallCount = 0;
  let doorCount = 0;
  let windowCount = 0;

  // Walls: one IfcWallStandardCase per solid box piece
  walls.forEach((wall) => {
    const openings = openingsByWall[wall.id] || [];
    wallSegments(wall, openings).forEach((seg) => {
      segmentBoxes(seg.length, wall.height, seg.openings).forEach((b) => {
        const lenPx = b.x1 - b.x0;
        const hPx = b.y1 - b.y0;
        if (lenPx <= 0 || hPx <= 0) return;

        const cx = seg.start[0] + Math.cos(seg.angle) * ((b.x0 + b.x1) / 2);
        const cy = seg.start[1] + Math.sin(seg.angle) * ((b.x0 + b.x1) / 2);

        const [placement, shape] = addBoxProductShape(
          w,
          [cx, cy],
          seg.angle,
          lenPx,
          wall.thickness,
          hPx,
          b.y0,
          context
        );

        wallCount += 1;
        products.push(
          w.add(
            `IFCWALLSTANDARDCASE('${ifcGuid()}',${w.ref(owner)},'Wall ${wallCount}',$,$,${w.ref(
              placement
            )},${w.ref(shape)},$)`
          )
        );
      });
    });
  });

  // Doors + windows: box products placed in their gaps
  all.forEach((el) => {
    if (el.type !== "door" && el.type !== "window") return;
    const wall = walls.find((wl) => wl.id === el.wallId);
    if (!wall) return;

    // compute world position of the opening centre
    let acc = 0;
    let center: Vec2 = wall.path[0];
    let angle = 0;
    for (let i = 0; i < wall.path.length - 1; i += 1) {
      const a = wall.path[i];
      const b = wall.path[i + 1];
      const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (el.offset >= acc && el.offset <= acc + segLen && segLen > 0) {
        const t = (el.offset - acc) / segLen;
        center = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        break;
      }
      acc += segLen;
    }

    const isDoor = el.type === "door";
    const elevPx = isDoor ? 0 : (el.sillHeight ?? 90);
    const hPx = isDoor ? DOOR_HEIGHT : WINDOW_HEIGHT;

    const [placement, shape] = addBoxProductShape(
      w,
      center,
      angle,
      el.width - 6,
      wall.thickness * 0.3,
      hPx - 4,
      elevPx + 2,
      context
    );

    if (isDoor) {
      doorCount += 1;
      products.push(
        w.add(
          `IFCDOOR('${ifcGuid()}',${w.ref(owner)},'Door ${doorCount}',$,$,${w.ref(
            placement
          )},${w.ref(shape)},'${el.id}',${mm(hPx)},${mm(el.width)})`
        )
      );
    } else {
      windowCount += 1;
      products.push(
        w.add(
          `IFCWINDOW('${ifcGuid()}',${w.ref(
            owner
          )},'Window ${windowCount}',$,$,${w.ref(placement)},${w.ref(
            shape
          )},'${el.id}',${mm(hPx)},${mm(el.width)})`
        )
      );
    }
  });

  // --- containment ---
  const relContained = `IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid()}',${w.ref(
    owner
  )},'Storey Elements',$,(${products.map((p) => w.ref(p)).join(",")}),${w.ref(
    storey
  )})`;
  if (products.length) w.add(relContained);

  const stamp = new Date().toISOString();

  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    `FILE_NAME('design.ifc','${stamp}',('Collabo'),('Collabo'),'Collabo','Collabo','');`,
    "FILE_SCHEMA(('IFC2X3'));",
    "ENDSEC;",
    "DATA;",
    w.body(),
    "ENDSEC;",
    "END-ISO-10303-21;",
  ].join("\n");
};
