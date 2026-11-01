import { useContext } from "react";

import { roomContext } from "../context/Room.context";

export const useRefs = () => {
  const {
    undoRef,
    bgRef,
    canvasRef,
    minimapRef,
    archStageRef,
    redoRef,
    selectionRefs,
  } = useContext(roomContext);

  return {
    undoRef,
    redoRef,
    bgRef,
    canvasRef,
    minimapRef,
    archStageRef,
    selectionRefs,
  };
};
