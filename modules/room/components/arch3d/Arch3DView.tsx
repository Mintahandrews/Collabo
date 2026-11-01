import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { FaTimes } from "react-icons/fa";

import { CANVAS_SIZE } from "@/common/constants/canvasSize";
import { useArch, useSetArch } from "@/common/recoil/arch";
import { useElements } from "@/common/recoil/elements";
import type { ElementsState } from "@/common/recoil/elements";
import { useRoom } from "@/common/recoil/room";
import type {
  OpeningElement,
  WallElement,
} from "@/common/types/elements";

import {
  DOOR_HEIGHT,
  segmentBoxes,
  wallSegments,
  WINDOW_HEIGHT,
} from "../../helpers/arch3d.helpers";

const CX = CANVAS_SIZE.width / 2;
const CZ = CANVAS_SIZE.height / 2;

const wallOpenings = (
  wallId: string,
  elements: ElementsState
): OpeningElement[] =>
  elements.order
    .map((id) => elements.byId[id])
    .filter(
      (el): el is OpeningElement =>
        !!el &&
        (el.type === "door" || el.type === "window") &&
        el.wallId === wallId
    );

const Wall3D = ({
  wall,
  openings,
}: {
  wall: WallElement;
  openings: OpeningElement[];
}) => {
  const segs = wallSegments(wall, openings);

  return (
    <>
      {segs.map((seg, i) => (
        // Plan (px, py) -> world (px, 0, py); -angle maps local +X onto the segment
        // eslint-disable-next-line react/no-array-index-key
        <group
          key={i}
          position={[seg.start[0], 0, seg.start[1]]}
          rotation={[0, -seg.angle, 0]}
        >
          {segmentBoxes(seg.length, wall.height, seg.openings).map((b, j) => {
            const w = b.x1 - b.x0;
            const h = b.y1 - b.y0;
            if (w <= 0 || h <= 0) return null;
            return (
              // eslint-disable-next-line react/no-array-index-key
              <mesh
                key={j}
                position={[(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[w, h, wall.thickness]} />
                <meshStandardMaterial color="#d6d3d1" />
              </mesh>
            );
          })}

          {seg.openings.map((o, j) =>
            o.kind === "door" ? (
              // Leaf hinged at the gap start, swung ~25° open
              // eslint-disable-next-line react/no-array-index-key
              <group
                key={`d${j}`}
                position={[o.offset - o.width / 2 + 3, 0, 0]}
                rotation={[0, -0.45, 0]}
              >
                <mesh position={[o.width / 2 - 3, DOOR_HEIGHT / 2, 0]}>
                  <boxGeometry args={[o.width - 6, DOOR_HEIGHT - 4, 4]} />
                  <meshStandardMaterial color="#92400e" />
                </mesh>
              </group>
            ) : (
              // eslint-disable-next-line react/no-array-index-key
              <mesh
                key={`w${j}`}
                position={[o.offset, o.sill + WINDOW_HEIGHT / 2, 0]}
              >
                <boxGeometry args={[o.width - 6, WINDOW_HEIGHT - 4, 4]} />
                <meshStandardMaterial
                  color="#7dd3fc"
                  transparent
                  opacity={0.5}
                />
              </mesh>
            )
          )}
        </group>
      ))}
    </>
  );
};

const Scene = () => {
  const elements = useElements();

  const walls = elements.order
    .map((id) => elements.byId[id])
    .filter((el): el is WallElement => !!el && el.type === "wall");

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[CX + 1500, 3000, CZ + 1500]} intensity={1} />

      {/* ground */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CX, -1, CZ]}
        receiveShadow
      >
        <planeGeometry args={[CANVAS_SIZE.width * 1.5, CANVAS_SIZE.height * 1.5]} />
        <meshStandardMaterial color="#e7e5e4" />
      </mesh>
      <gridHelper
        args={[CANVAS_SIZE.width, CANVAS_SIZE.width / 50, "#a8a29e", "#d4d4d8"]}
        position={[CX, 0, CZ]}
      />

      {walls.map((wall) => (
        <Wall3D
          key={wall.id}
          wall={wall}
          openings={wallOpenings(wall.id, elements)}
        />
      ))}

      <OrbitControls target={[CX, 0, CZ]} makeDefault />
    </>
  );
};

const Arch3DView = () => {
  const room = useRoom();
  const { view3d } = useArch();
  const { toggleView3d } = useSetArch();

  if (room.kind !== "architect" || !view3d) return null;

  return (
    <div className="absolute bottom-4 left-1/2 z-40 h-[320px] w-[92vw] max-w-[560px] -translate-x-1/2 overflow-hidden rounded-lg border-2 border-zinc-700 bg-stone-100 shadow-2xl sm:left-24 sm:h-[380px] sm:w-[560px] sm:translate-x-0">
      <div className="absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-white">
        3D Preview
      </div>
      <button
        className="absolute right-2 top-2 z-10 rounded bg-black/60 p-1.5 text-white hover:bg-black/80"
        onClick={toggleView3d}
        aria-label="Close 3D preview"
      >
        <FaTimes />
      </button>
      <Canvas
        shadows
        camera={{ position: [CX + 1500, 1800, CZ + 1800], fov: 50, near: 1, far: 20000 }}
      >
        <Scene />
      </Canvas>
    </div>
  );
};

export default Arch3DView;
