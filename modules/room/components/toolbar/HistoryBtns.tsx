import { FaRedo, FaUndo } from "react-icons/fa";

import { useElementHistory } from "@/common/recoil/elements";
import { useMyMoves } from "@/common/recoil/room";
import { useSavedMoves } from "@/common/recoil/savedMoves";

import { useRefs } from "../../hooks/useRefs";

const HistoryBtns = () => {
  const { redoRef, undoRef } = useRefs();

  const { myMoves } = useMyMoves();
  const savedMoves = useSavedMoves();
  const elementHistory = useElementHistory();

  return (
    <>
      <button
        className="btn-icon text-xl"
        ref={redoRef}
        disabled={!savedMoves.length && !elementHistory.redo.length}
        aria-label="Redo"
      >
        <FaRedo />
      </button>
      <button
        className="btn-icon text-xl"
        ref={undoRef}
        disabled={!myMoves.length && !elementHistory.undo.length}
        aria-label="Undo"
      >
        <FaUndo />
      </button>
    </>
  );
};

export default HistoryBtns;
