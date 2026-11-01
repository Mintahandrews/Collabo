import {
  useRecoilCallback,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";

import { socket } from "@/common/lib/socket";
import type { DesignElement, ElementOp } from "@/common/types/elements";

import {
  elementHistoryAtom,
  elementsAtom,
  ElementsState,
  HistoryEntry,
} from "./elements.atom";

export const useElements = () => {
  return useRecoilValue(elementsAtom);
};

export const useElementHistory = () => {
  return useRecoilValue(elementHistoryAtom);
};

// The op that undoes `op`, computed against the state before it applied.
const inverseOf = (op: ElementOp, state: ElementsState): ElementOp | null => {
  if (op.kind === "add") return { kind: "delete", id: op.element.id };

  if (op.kind === "delete") {
    const el = state.byId[op.id];
    return el ? { kind: "add", element: el } : null;
  }

  if (op.kind === "update") {
    const el = state.byId[op.id];
    if (!el) return null;
    const patch: Record<string, unknown> = {};
    Object.keys(op.patch).forEach((key) => {
      patch[key] = (el as unknown as Record<string, unknown>)[key];
    });
    return { kind: "update", id: op.id, patch };
  }

  return null;
};

export const useSetElements = () => {
  const setElementsState = useSetRecoilState(elementsAtom);
  const setHistory = useSetRecoilState(elementHistoryAtom);

  const setElements = (elements: DesignElement[]) => {
    setElementsState({
      order: elements.map((el) => el.id),
      byId: Object.fromEntries(elements.map((el) => [el.id, el])),
    });
    setHistory({ undo: [], redo: [] });
  };

  const applyOp = (op: ElementOp) => {
    setElementsState((prev) => applyElementOp(prev, op));
  };

  const emitElementOp = useRecoilCallback(
    ({ snapshot, set }) =>
      (op: ElementOp) => {
        const current = snapshot.getLoadable(elementsAtom).getValue();
        const inverse = inverseOf(op, current);

        set(elementsAtom, (prev) => applyElementOp(prev, op));

        if (inverse) {
          set(elementHistoryAtom, (prev) => ({
            undo: [...prev.undo, { forward: op, inverse } as HistoryEntry],
            redo: [],
          }));
        }

        socket.emit("element_op", op);
      },
    []
  );

  return { setElements, applyOp, emitElementOp };
};

export const useElementHistoryActions = () => {
  const undoElement = useRecoilCallback(
    ({ snapshot, set }) =>
      () => {
        const hist = snapshot.getLoadable(elementHistoryAtom).getValue();
        const entry = hist.undo[hist.undo.length - 1];
        if (!entry) return;

        set(elementHistoryAtom, {
          undo: hist.undo.slice(0, -1),
          redo: [...hist.redo, entry],
        });
        set(elementsAtom, (prev) => applyElementOp(prev, entry.inverse));
        socket.emit("element_op", entry.inverse);
      },
    []
  );

  const redoElement = useRecoilCallback(
    ({ snapshot, set }) =>
      () => {
        const hist = snapshot.getLoadable(elementHistoryAtom).getValue();
        const entry = hist.redo[hist.redo.length - 1];
        if (!entry) return;

        set(elementHistoryAtom, {
          undo: [...hist.undo, entry],
          redo: hist.redo.slice(0, -1),
        });
        set(elementsAtom, (prev) => applyElementOp(prev, entry.forward));
        socket.emit("element_op", entry.forward);
      },
    []
  );

  return { undoElement, redoElement };
};

export const applyElementOp = (
  state: ElementsState,
  op: ElementOp
): ElementsState => {
  if (op.kind === "add") {
    return {
      order: state.byId[op.element.id]
        ? state.order
        : [...state.order, op.element.id],
      byId: { ...state.byId, [op.element.id]: op.element },
    };
  }

  if (op.kind === "update") {
    const element = state.byId[op.id];
    if (!element) return state;

    return {
      ...state,
      byId: {
        ...state.byId,
        [op.id]: {
          ...element,
          ...op.patch,
          id: element.id,
          type: element.type,
        } as DesignElement,
      },
    };
  }

  if (op.kind === "delete") {
    if (!state.byId[op.id]) return state;

    const byId = { ...state.byId };
    delete byId[op.id];

    return { order: state.order.filter((id) => id !== op.id), byId };
  }

  return state;
};
