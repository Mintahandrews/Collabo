import type Konva from "konva";
import { Arc, Group, Line } from "react-konva";

import {
  ELEMENT_COLOR,
  ELEMENT_SELECTED_COLOR,
} from "@/common/constants/arch";
import type { OpeningElement, Vec2 } from "@/common/types/elements";

import {
  dist,
  pointAtLength,
  polylineLength,
  projectOntoPolyline,
} from "../../helpers/arch.helpers";

interface Props {
  element: OpeningElement;
  wallPath: Vec2[];
  wallThickness: number;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
  onMove: (offset: number) => void;
}

const deg = (rad: number) => (rad * 180) / Math.PI;

const OpeningShape = ({
  element,
  wallPath,
  wallThickness,
  selected,
  selectable,
  onSelect,
  onMove,
}: Props) => {
  const color = selected ? ELEMENT_SELECTED_COLOR : ELEMENT_COLOR;
  const half = element.width / 2;
  const start = pointAtLength(wallPath, element.offset - half);
  const end = pointAtLength(wallPath, element.offset + half);
  const center = pointAtLength(wallPath, element.offset).point;
  const wallLen = polylineLength(wallPath);
  const clampOffset = (o: number) =>
    Math.max(half, Math.min(wallLen - half, o));

  const dragProps =
    selectable && selected
      ? {
          draggable: true,
          dragBoundFunc: (pos: { x: number; y: number }) => {
            const target: Vec2 = [center[0] + pos.x, center[1] + pos.y];
            const proj = projectOntoPolyline(wallPath, target);
            const { point } = pointAtLength(wallPath, clampOffset(proj.offset));
            return { x: point[0] - center[0], y: point[1] - center[1] };
          },
          onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
            const node = e.target;
            const target: Vec2 = [
              center[0] + node.position().x,
              center[1] + node.position().y,
            ];
            const proj = projectOntoPolyline(wallPath, target);
            node.position({ x: 0, y: 0 });
            onMove(clampOffset(proj.offset));
          },
        }
      : {};

  // Wall direction normal (screen space, y down)
  const angle = start.angle;
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);

  const swing = Math.max(30, dist(start.point, end.point));

  const clickProps = selectable
    ? { onClick: onSelect, onTap: onSelect }
    : {};

  const groupProps = { ...clickProps, ...dragProps };

  if (element.type === "door") {
    // Hinge at the gap start; leaf swings 90° to the normal side
    const leafEnd: Vec2 = [
      start.point[0] + nx * swing,
      start.point[1] + ny * swing,
    ];

    return (
      <Group {...groupProps}>
        <Line
          points={[start.point[0], start.point[1], leafEnd[0], leafEnd[1]]}
          stroke={color}
          strokeWidth={2}
          hitStrokeWidth={15}
        />
        <Arc
          x={start.point[0]}
          y={start.point[1]}
          innerRadius={swing}
          outerRadius={swing}
          angle={90}
          rotation={deg(angle)}
          stroke={color}
          strokeWidth={1}
          listening={false}
        />
      </Group>
    );
  }

  // Window: two parallel lines at the wall faces, joined at the ends
  const h = wallThickness / 2;
  const line = (p: Vec2, q: Vec2, side: 1 | -1) => [
    p[0] + nx * h * side,
    p[1] + ny * h * side,
    q[0] + nx * h * side,
    q[1] + ny * h * side,
  ];

  return (
    <Group {...groupProps}>
      <Line
        points={line(start.point, end.point, 1)}
        stroke={color}
        strokeWidth={2}
        hitStrokeWidth={15}
      />
      <Line
        points={line(start.point, end.point, -1)}
        stroke={color}
        strokeWidth={2}
        listening={false}
      />
      <Line
        points={[
          start.point[0] + nx * h,
          start.point[1] + ny * h,
          start.point[0] - nx * h,
          start.point[1] - ny * h,
        ]}
        stroke={color}
        strokeWidth={2}
        listening={false}
      />
      <Line
        points={[
          end.point[0] + nx * h,
          end.point[1] + ny * h,
          end.point[0] - nx * h,
          end.point[1] - ny * h,
        ]}
        stroke={color}
        strokeWidth={2}
        listening={false}
      />
    </Group>
  );
};

export default OpeningShape;
