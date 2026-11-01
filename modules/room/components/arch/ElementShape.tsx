import { useEffect, useState } from "react";

import { Ellipse, Image as KonvaImage, Line, Rect, Text } from "react-konva";

import { ELEMENT_COLOR, ELEMENT_SELECTED_COLOR } from "@/common/constants/arch";
import { getStringFromRgba } from "@/common/lib/rgba";
import type { ElementsState } from "@/common/recoil/elements";
import type {
  DesignElement,
  ElementPatch,
  OpeningElement,
  Vec2,
} from "@/common/types/elements";

import DimensionShape from "./DimensionShape";
import OpeningShape from "./OpeningShape";
import WallShape from "./WallShape";

interface Props {
  element: DesignElement;
  elements: ElementsState;
  selectedId: string | null;
  selectable: boolean;
  onSelect: (id: string) => void;
  onMoveElement: (id: string, delta: Vec2) => void;
  onUpdateElement: (id: string, patch: ElementPatch) => void;
}

const elementOpenings = (
  wallId: string,
  elements: ElementsState
): OpeningElement[] => {
  return elements.order
    .map((id) => elements.byId[id])
    .filter(
      (el): el is OpeningElement =>
        !!el &&
        (el.type === "door" || el.type === "window") &&
        el.wallId === wallId
    );
};

const ElementShape = ({
  element,
  elements,
  selectedId,
  selectable,
  onSelect,
  onMoveElement,
  onUpdateElement,
}: Props) => {
  const selected = selectedId === element.id;
  const clickProps = selectable ? { onClick: () => onSelect(element.id), onTap: () => onSelect(element.id) } : {};

  if (element.type === "wall") {
    const openings = elementOpenings(element.id, elements);

    return (
      <>
        <WallShape
          element={element}
          openings={openings}
          selected={selected}
          selectable={selectable}
          onSelect={() => onSelect(element.id)}
          onDragEnd={(delta) => onMoveElement(element.id, delta)}
        />
        {openings.map((opening) => (
          <OpeningShape
            key={opening.id}
            element={opening}
            wallPath={element.path}
            wallThickness={element.thickness}
            selected={selectedId === opening.id}
            selectable={selectable}
            onSelect={() => onSelect(opening.id)}
            onMove={(offset) => onUpdateElement(opening.id, { offset })}
          />
        ))}
      </>
    );
  }

  if (element.type === "door" || element.type === "window") {
    // Rendered by their host wall
    return null;
  }

  if (element.type === "dimension") {
    return (
      <DimensionShape
        element={element}
        selected={selected}
        selectable={selectable}
        onSelect={() => onSelect(element.id)}
      />
    );
  }

  const color = selected ? ELEMENT_SELECTED_COLOR : undefined;

  if (element.type === "stroke") {
    return (
      <Line
        points={element.path.flat()}
        stroke={color || getStringFromRgba(element.color)}
        strokeWidth={element.lineWidth}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={element.lineWidth + 10}
        {...clickProps}
      />
    );
  }

  if (element.type === "line") {
    return (
      <Line
        points={[...element.from, ...element.to]}
        stroke={color || getStringFromRgba(element.color)}
        strokeWidth={element.lineWidth}
        hitStrokeWidth={element.lineWidth + 10}
        {...clickProps}
      />
    );
  }

  if (element.type === "rect") {
    return (
      <Rect
        x={element.from[0]}
        y={element.from[1]}
        width={element.to[0] - element.from[0]}
        height={element.to[1] - element.from[1]}
        stroke={color || getStringFromRgba(element.color)}
        strokeWidth={element.lineWidth}
        fill={element.fillColor ? getStringFromRgba(element.fillColor) : undefined}
        {...clickProps}
      />
    );
  }

  if (element.type === "ellipse") {
    return (
      <Ellipse
        x={(element.from[0] + element.to[0]) / 2}
        y={(element.from[1] + element.to[1]) / 2}
        radiusX={Math.abs(element.to[0] - element.from[0]) / 2}
        radiusY={Math.abs(element.to[1] - element.from[1]) / 2}
        stroke={color || getStringFromRgba(element.color)}
        strokeWidth={element.lineWidth}
        fill={element.fillColor ? getStringFromRgba(element.fillColor) : undefined}
        {...clickProps}
      />
    );
  }

  if (element.type === "text") {
    return (
      <Text
        x={element.at[0]}
        y={element.at[1]}
        text={element.text}
        fontSize={element.fontSize}
        fill={color || getStringFromRgba(element.color)}
        {...clickProps}
      />
    );
  }

  if (element.type === "image") {
    return (
      <ImageShape
        element={element}
        selected={selected}
        selectable={selectable}
        onSelect={() => onSelect(element.id)}
      />
    );
  }

  return null;
};

interface ImageProps {
  element: Extract<DesignElement, { type: "image" }>;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
}

const ImageShape = ({ element, selected, selectable, onSelect }: ImageProps) => {
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const image = new window.Image();
    image.src = `data:image/png;base64,${element.base64}`;
    image.onload = () => setImg(image);
  }, [element.base64]);

  if (!img) return null;

  return (
    <KonvaImage
      image={img}
      x={element.at[0]}
      y={element.at[1]}
      width={element.width}
      height={element.height}
      stroke={selected ? ELEMENT_SELECTED_COLOR : undefined}
      {...(selectable ? { onClick: onSelect, onTap: onSelect } : {})}
    />
  );
};

export { elementOpenings };
export default ElementShape;
