import type Konva from "konva";
import { Group, Line } from "react-konva";

import { ELEMENT_COLOR, ELEMENT_SELECTED_COLOR } from "@/common/constants/arch";
import type {
  OpeningElement,
  Vec2,
  WallElement,
} from "@/common/types/elements";

import {
  polylineLength,
  slicePolyline,
  solidIntervals,
} from "../../helpers/arch.helpers";

interface Props {
  element: WallElement;
  openings: OpeningElement[];
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
  onDragEnd: (delta: Vec2) => void;
}

const WallShape = ({
  element,
  openings,
  selected,
  selectable,
  onSelect,
  onDragEnd,
}: Props) => {
  const length = polylineLength(element.path);
  const intervals = solidIntervals(
    length,
    openings.map((o) => ({ offset: o.offset, width: o.width }))
  );

  const color = selected ? ELEMENT_SELECTED_COLOR : ELEMENT_COLOR;

  return (
    <Group
      draggable={selectable && selected}
      onClick={selectable ? onSelect : undefined}
      onTap={selectable ? onSelect : undefined}
      onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
        const { x, y } = e.target.position();
        e.target.position({ x: 0, y: 0 });
        onDragEnd([x, y]);
      }}
    >
      {intervals.map(([from, to], i) => {
        const points = slicePolyline(element.path, from, to).flat();
        if (points.length < 4) return null;
        return (
          <Line
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            points={points}
            stroke={color}
            strokeWidth={element.thickness}
            lineCap="butt"
            lineJoin="round"
            hitStrokeWidth={element.thickness + 15}
            shadowColor={selected ? ELEMENT_SELECTED_COLOR : undefined}
            shadowBlur={selected ? 8 : 0}
          />
        );
      })}
    </Group>
  );
};

export default WallShape;
