import { useEffect, useRef, useState } from "react";

import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { motion } from "framer-motion";
import { Circle, Layer, Line, Shape, Stage } from "react-konva";
import { v4 } from "uuid";

import {
  DIMENSION_OFFSET,
  DOOR_WIDTH,
  ELEMENT_COLOR,
  GRID_COLOR,
  GRID_SIZE,
  SNAP_RADIUS,
  WALL_HEIGHT,
  WALL_SNAP_DISTANCE,
  WALL_THICKNESS,
  WINDOW_SILL,
  WINDOW_WIDTH,
} from "@/common/constants/arch";
import { CANVAS_SIZE } from "@/common/constants/canvasSize";
import { useArch, useSetArch } from "@/common/recoil/arch";
import { useElements, useSetElements } from "@/common/recoil/elements";
import type {
  DesignElement,
  ElementPatch,
  Vec2,
  WallElement,
} from "@/common/types/elements";

import { useBoardPosition } from "../../hooks/useBoardPosition";
import { useRefs } from "../../hooks/useRefs";
import { useViewportSize } from "@/common/hooks/useViewportSize";
import {
  dist,
  polylineLength,
  projectOntoPolyline,
  snapPoint,
} from "../../helpers/arch.helpers";
import DimensionShape from "./DimensionShape";
import ElementShape from "./ElementShape";

const GridLines = () => (
  <Shape
    listening={false}
    stroke={GRID_COLOR}
    strokeWidth={1}
    sceneFunc={(ctx, shape) => {
      ctx.beginPath();
      for (let gx = 0; gx <= CANVAS_SIZE.width; gx += GRID_SIZE) {
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, CANVAS_SIZE.height);
      }
      for (let gy = 0; gy <= CANVAS_SIZE.height; gy += GRID_SIZE) {
        ctx.moveTo(0, gy);
        ctx.lineTo(CANVAS_SIZE.width, gy);
      }
      ctx.strokeShape(shape);
    }}
  />
);

const movePatch = (el: DesignElement, delta: Vec2): ElementPatch | null => {
  const shift = (p: Vec2): Vec2 => [p[0] + delta[0], p[1] + delta[1]];
  switch (el.type) {
    case "wall":
    case "stroke":
      return { path: el.path.map(shift) };
    case "line":
    case "rect":
    case "ellipse":
    case "dimension":
      return { from: shift(el.from), to: shift(el.to) };
    case "text":
    case "image":
      return { at: shift(el.at) };
    case "room":
      return { polygon: el.polygon.map(shift) };
    default:
      return null;
  }
};

const ArchStage = () => {
  const { x, y } = useBoardPosition();
  const { tool, selectedId, grid, snap } = useArch();
  const { setSelectedId } = useSetArch();
  const elements = useElements();
  const { emitElementOp } = useSetElements();

  const stageRef = useRef<Konva.Stage>(null);
  const { archStageRef } = useRefs();
  const [wallDraft, setWallDraft] = useState<Vec2[] | null>(null);
  const [dimDraft, setDimDraft] = useState<{ from: Vec2; to: Vec2 } | null>(null);
  const [hover, setHover] = useState<Vec2 | null>(null);
  const [panning, setPanning] = useState<{
    sx: number;
    sy: number;
    ox: number;
    oy: number;
  } | null>(null);
  const { width: vpW, height: vpH } = useViewportSize();

  const interactive = tool !== "none";
  const selectable = tool === "select";

  // Expose the stage for PNG export
  useEffect(() => {
    archStageRef.current = stageRef.current;
  }, [archStageRef]);

  const walls = elements.order
    .map((id) => elements.byId[id])
    .filter((el): el is WallElement => !!el && el.type === "wall");

  const endpoints: Vec2[] = walls.flatMap((w) => w.path);

  const snapPos = (p: Vec2, shiftKey: boolean): Vec2 => {
    if (!snap) return p;
    const lastPoint = wallDraft?.[wallDraft.length - 1];
    return snapPoint(p, {
      gridOn: grid,
      gridSize: GRID_SIZE,
      snapRadius: SNAP_RADIUS,
      endpoints,
      axisFrom: shiftKey ? lastPoint : undefined,
    });
  };

  const getPointerPos = (): Vec2 | null => {
    const pos = stageRef.current?.getPointerPosition();
    return pos ? [pos.x, pos.y] : null;
  };

  const finishWall = () => {
    if (wallDraft && wallDraft.length >= 2) {
      emitElementOp({
        kind: "add",
        element: {
          id: v4(),
          type: "wall",
          path: wallDraft,
          thickness: WALL_THICKNESS,
          height: WALL_HEIGHT,
        },
      });
    }
    setWallDraft(null);
  };

  const placeOpening = (p: Vec2, type: "door" | "window") => {
    let best: { wall: WallElement; offset: number; distance: number } | null =
      null;

    walls.forEach((wall) => {
      const proj = projectOntoPolyline(wall.path, p);
      if (proj.distance >= WALL_SNAP_DISTANCE) return;
      if (best && proj.distance >= best.distance) return;

      const len = polylineLength(wall.path);
      const width = type === "door" ? DOOR_WIDTH : WINDOW_WIDTH;
      best = {
        wall,
        offset: Math.max(width / 2, Math.min(len - width / 2, proj.offset)),
        distance: proj.distance,
      };
    });

    const found = best as {
      wall: WallElement;
      offset: number;
      distance: number;
    } | null;
    if (!found) return;

    const { wall, offset } = found;
    emitElementOp({
      kind: "add",
      element: {
        id: v4(),
        type,
        wallId: wall.id,
        offset,
        width: type === "door" ? DOOR_WIDTH : WINDOW_WIDTH,
        ...(type === "window" ? { sillHeight: WINDOW_SILL } : {}),
      },
    });
  };

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0) return;
    const raw = getPointerPos();
    if (!raw) return;
    const p = snapPos(raw, e.evt.shiftKey);

    if (tool === "wall") {
      setWallDraft((prev) => (prev ? [...prev, p] : [p]));
      return;
    }

    if (tool === "door" || tool === "window") {
      placeOpening(p, tool);
      return;
    }

    if (tool === "dimension") {
      setDimDraft({ from: p, to: p });
      return;
    }

    if (tool === "select" && e.target === stageRef.current) {
      setSelectedId(null);
      // Drag empty space with the select tool to pan the board
      setPanning({ sx: e.evt.clientX, sy: e.evt.clientY, ox: x.get(), oy: y.get() });
    }
  };

  const panTo = (cx: number, cy: number) => {
    if (!panning) return;
    x.set(
      Math.max(
        -(CANVAS_SIZE.width - vpW),
        Math.min(0, panning.ox + cx - panning.sx)
      )
    );
    y.set(
      Math.max(
        -(CANVAS_SIZE.height - vpH),
        Math.min(0, panning.oy + cy - panning.sy)
      )
    );
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (panning) {
      panTo(e.evt.clientX, e.evt.clientY);
      return;
    }
    const raw = getPointerPos();
    if (!raw) return;
    const p = snapPos(raw, e.evt.shiftKey);
    setHover(p);

    setDimDraft((prev) => (prev ? { ...prev, to: p } : prev));
  };

  const handleMouseUp = () => {
    if (panning) {
      setPanning(null);
      return;
    }
    if (tool === "dimension" && dimDraft) {
      if (dist(dimDraft.from, dimDraft.to) > 5) {
        emitElementOp({
          kind: "add",
          element: {
            id: v4(),
            type: "dimension",
            from: dimDraft.from,
            to: dimDraft.to,
            offset: DIMENSION_OFFSET,
          },
        });
      }
      setDimDraft(null);
    }
  };

  const handleMoveElement = (id: string, delta: Vec2) => {
    const el = elements.byId[id];
    if (!el) return;
    const patch = movePatch(el, delta);
    if (patch) emitElementOp({ kind: "update", id, patch });
  };

  const handleUpdateElement = (id: string, patch: ElementPatch) => {
    emitElementOp({ kind: "update", id, patch });
  };

  // Reset in-progress drafts when the tool changes
  useEffect(() => {
    setWallDraft(null);
    setDimDraft(null);
    setHover(null);
  }, [tool]);

  // Keyboard: Enter finishes a wall, Escape cancels, Delete removes selection
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;

      if (e.key === "Enter") finishWall();
      if (e.key === "Escape") {
        setWallDraft(null);
        setDimDraft(null);
        setSelectedId(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        emitElementOp({ kind: "delete", id: selectedId });
        setSelectedId(null);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallDraft, selectedId, emitElementOp, setSelectedId]);

  const wallPreview =
    tool === "wall" && wallDraft && hover
      ? [...wallDraft, hover]
      : wallDraft;

  return (
    <motion.div
      className={`absolute top-0 z-20 ${
        interactive ? "cursor-crosshair" : ""
      }`}
      style={{
        x,
        y,
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      <Stage
        ref={stageRef}
        width={CANVAS_SIZE.width}
        height={CANVAS_SIZE.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDblClick={finishWall}
        onTouchStart={(e) => {
          if (e.evt.touches.length !== 1) return;
          const raw = getPointerPos();
          if (!raw) return;
          const p = snapPos(raw, false);
          if (tool === "wall") {
            setWallDraft((prev) => (prev ? [...prev, p] : [p]));
          } else if (tool === "door" || tool === "window") {
            placeOpening(p, tool);
          } else if (tool === "dimension") {
            setDimDraft({ from: p, to: p });
          } else if (tool === "select" && e.target === stageRef.current) {
            setSelectedId(null);
            const t = e.evt.touches[0];
            setPanning({ sx: t.clientX, sy: t.clientY, ox: x.get(), oy: y.get() });
          }
        }}
        onTouchMove={(e) => {
          if (panning && e.evt.touches.length === 1) {
            const t = e.evt.touches[0];
            panTo(t.clientX, t.clientY);
            return;
          }
          const raw = getPointerPos();
          if (!raw) return;
          const p = snapPos(raw, false);
          setHover(p);
          setDimDraft((prev) => (prev ? { ...prev, to: p } : prev));
        }}
        onTouchEnd={handleMouseUp}
        onDblTap={finishWall}
      >
        <Layer>
          {grid && <GridLines />}

          {elements.order.map((id) => {
            const element = elements.byId[id];
            if (!element) return null;
            return (
              <ElementShape
                key={id}
                element={element}
                elements={elements}
                selectedId={selectedId}
                selectable={selectable}
                onSelect={setSelectedId}
                onMoveElement={handleMoveElement}
                onUpdateElement={handleUpdateElement}
              />
            );
          })}

          {/* wall draft preview */}
          {wallPreview && wallPreview.length >= 2 && (
            <Line
              points={wallPreview.flat()}
              stroke={ELEMENT_COLOR}
              strokeWidth={WALL_THICKNESS}
              lineCap="butt"
              lineJoin="round"
              opacity={0.5}
              listening={false}
            />
          )}
          {wallDraft?.map((p, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Circle
              key={i}
              x={p[0]}
              y={p[1]}
              radius={4}
              fill={ELEMENT_COLOR}
              listening={false}
            />
          ))}

          {/* dimension draft preview */}
          {dimDraft && dist(dimDraft.from, dimDraft.to) > 5 && (
            <DimensionShape
              element={{
                id: "draft",
                type: "dimension",
                from: dimDraft.from,
                to: dimDraft.to,
                offset: DIMENSION_OFFSET,
              }}
              selected={false}
              selectable={false}
              onSelect={() => {}}
            />
          )}

          {/* snap indicator */}
          {interactive && hover && (
            <Circle
              x={hover[0]}
              y={hover[1]}
              radius={3}
              fill="#2563eb"
              opacity={0.7}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
    </motion.div>
  );
};

export default ArchStage;
