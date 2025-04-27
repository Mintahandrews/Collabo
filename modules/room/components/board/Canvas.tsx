import { useEffect, useState, useCallback } from "react";

import { motion } from "framer-motion";
import { BsArrowsMove } from "react-icons/bs";
import throttle from "lodash/throttle";

import { CANVAS_SIZE } from "@/common/constants/canvasSize";
import { useViewportSize } from "@/common/hooks/useViewportSize";
import { socket } from "@/common/lib/socket";

import { useBoardPosition } from "../../hooks/useBoardPosition";
import { useCtx } from "../../hooks/useCtx";
import { useDraw } from "../../hooks/useDraw";
import { useMovesHandlers } from "../../hooks/useMovesHandlers";
import { useRefs } from "../../hooks/useRefs";
import { useSocketDraw } from "../../hooks/useSocketDraw";
import Background from "./Background";
import MiniMap from "./Minimap";

const Canvas = () => {
  const { canvasRef, bgRef, undoRef, redoRef } = useRefs();
  const { width, height } = useViewportSize();
  const { x, y } = useBoardPosition();
  const ctx = useCtx();

  const [dragging, setDragging] = useState(true);
  const [touchPoints, setTouchPoints] = useState<React.Touch[]>([]);

  const {
    handleEndDrawing,
    handleDraw,
    handleStartDrawing,
    drawing,
    clearOnYourMove,
  } = useDraw(dragging);
  useSocketDraw(drawing);

  const { handleUndo, handleRedo } = useMovesHandlers(clearOnYourMove);

  // Throttled version of handleDraw for better performance
  const throttledHandleDraw = useCallback(
    throttle((clientX: number, clientY: number, shiftKey: boolean = false) => {
      handleDraw(clientX, clientY, shiftKey);
    }, 5),
    [handleDraw]
  );

  useEffect(() => {
    setDragging(false);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length >= 2) {
      // If two or more touches, we're trying to zoom/pan
      setDragging(true);
      setTouchPoints(Array.from(e.touches));
    } else {
      // Single touch means drawing
      handleStartDrawing(e.touches[0].clientX, e.touches[0].clientY);
    }
    // Prevent default to avoid scrolling
    e.preventDefault();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length >= 2) {
      // Handle pinch zoom or pan gestures here
      setTouchPoints(Array.from(e.touches));
    } else if (!dragging) {
      // Only draw if we're not in dragging mode
      throttledHandleDraw(e.touches[0].clientX, e.touches[0].clientY);
    }
    // Prevent default to avoid scrolling
    e.preventDefault();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      // If we're down to less than 2 touches and were previously dragging
      if (touchPoints.length >= 2) {
        // Wait a moment before re-enabling drawing to prevent accidental marks
        setTimeout(() => {
          setDragging(false);
        }, 100);
      }
      setTouchPoints(Array.from(e.touches));
      handleEndDrawing();
    }
    // Prevent default behavior
    e.preventDefault();
  };

  // SETUP
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      setDragging(e.ctrlKey);
    };

    window.addEventListener("keyup", handleKey);
    window.addEventListener("keydown", handleKey);

    const undoBtn = undoRef.current;
    const redoBtn = redoRef.current;

    undoBtn?.addEventListener("click", handleUndo);
    redoBtn?.addEventListener("click", handleRedo);

    return () => {
      window.removeEventListener("keyup", handleKey);
      window.removeEventListener("keydown", handleKey);
      undoBtn?.removeEventListener("click", handleUndo);
      redoBtn?.removeEventListener("click", handleRedo);
    };
  }, [canvasRef, dragging, handleRedo, handleUndo, redoRef, undoRef]);

  useEffect(() => {
    if (ctx) socket.emit("joined_room");
  }, [ctx]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <motion.canvas
        // SETTINGS
        ref={canvasRef}
        width={CANVAS_SIZE.width}
        height={CANVAS_SIZE.height}
        className={`absolute top-0 z-10 ${
          dragging && "cursor-move"
        } touch-none`}
        style={{ x, y }}
        // DRAG
        drag={dragging}
        dragConstraints={{
          left: -(CANVAS_SIZE.width - width),
          right: 0,
          top: -(CANVAS_SIZE.height - height),
          bottom: 0,
        }}
        dragElastic={0}
        dragTransition={{ power: 0, timeConstant: 0 }}
        // HANDLERS
        onMouseDown={(e) => handleStartDrawing(e.clientX, e.clientY)}
        onMouseUp={handleEndDrawing}
        onMouseMove={(e) => {
          throttledHandleDraw(e.clientX, e.clientY, e.shiftKey);
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
      />
      <Background bgRef={bgRef} />

      <MiniMap dragging={dragging} />
      <button
        className={`absolute bottom-14 right-5 z-10 rounded-xl md:bottom-5 ${
          dragging ? "bg-green-500" : "bg-zinc-300 text-black"
        } p-3 text-lg text-white`}
        onClick={() => setDragging((prev) => !prev)}
        aria-label={dragging ? "Switch to drawing mode" : "Switch to move mode"}
      >
        <BsArrowsMove />
      </button>
    </div>
  );
};

export default Canvas;
