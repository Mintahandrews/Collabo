import { Group, Line, Text } from "react-konva";

import {
  ELEMENT_COLOR,
  ELEMENT_SELECTED_COLOR,
  PX_PER_METER,
} from "@/common/constants/arch";
import type { DimensionElement } from "@/common/types/elements";

import { dist } from "../../helpers/arch.helpers";

interface Props {
  element: DimensionElement;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
}

const DimensionShape = ({ element, selected, selectable, onSelect }: Props) => {
  const { from, to, offset } = element;
  const color = selected ? ELEMENT_SELECTED_COLOR : ELEMENT_COLOR;

  const length = dist(from, to);
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;

  const tick = 6;
  const dimFrom: [number, number] = [
    from[0] + nx * offset,
    from[1] + ny * offset,
  ];
  const dimTo: [number, number] = [to[0] + nx * offset, to[1] + ny * offset];

  const meters = (length / PX_PER_METER).toFixed(2);
  const mid: [number, number] = [
    (dimFrom[0] + dimTo[0]) / 2,
    (dimFrom[1] + dimTo[1]) / 2,
  ];

  const clickProps = selectable
    ? { onClick: onSelect, onTap: onSelect }
    : {};

  return (
    <Group {...clickProps}>
      {/* extension lines */}
      <Line
        points={[from[0], from[1], dimFrom[0], dimFrom[1]]}
        stroke={color}
        strokeWidth={1}
        listening={false}
      />
      <Line
        points={[to[0], to[1], dimTo[0], dimTo[1]]}
        stroke={color}
        strokeWidth={1}
        listening={false}
      />
      {/* main dimension line */}
      <Line
        points={[dimFrom[0], dimFrom[1], dimTo[0], dimTo[1]]}
        stroke={color}
        strokeWidth={1.5}
        hitStrokeWidth={12}
      />
      {/* end ticks */}
      <Line
        points={[
          dimFrom[0] - (ux - uy) * tick,
          dimFrom[1] - (uy + ux) * tick,
          dimFrom[0] + (ux - uy) * tick,
          dimFrom[1] + (uy + ux) * tick,
        ]}
        stroke={color}
        strokeWidth={1.5}
        listening={false}
      />
      <Line
        points={[
          dimTo[0] - (ux - uy) * tick,
          dimTo[1] - (uy + ux) * tick,
          dimTo[0] + (ux - uy) * tick,
          dimTo[1] + (uy + ux) * tick,
        ]}
        stroke={color}
        strokeWidth={1.5}
        listening={false}
      />
      <Text
        x={mid[0]}
        y={mid[1]}
        text={`${meters} m`}
        fontSize={14}
        fill={color}
        rotation={(angle * 180) / Math.PI}
        offsetX={meters.length * 4 + 12}
        offsetY={10}
        listening={false}
      />
    </Group>
  );
};

export default DimensionShape;
