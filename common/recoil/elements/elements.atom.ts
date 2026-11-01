import { atom } from "recoil";

import type { DesignElement, ElementOp } from "@/common/types/elements";

export interface ElementsState {
  order: string[];
  byId: Record<string, DesignElement>;
}

export const elementsAtom = atom<ElementsState>({
  key: "elements",
  default: { order: [], byId: {} },
});

export interface HistoryEntry {
  forward: ElementOp;
  inverse: ElementOp;
}

export interface ElementHistoryState {
  undo: HistoryEntry[];
  redo: HistoryEntry[];
}

export const elementHistoryAtom = atom<ElementHistoryState>({
  key: "elementHistory",
  default: { undo: [], redo: [] },
});
