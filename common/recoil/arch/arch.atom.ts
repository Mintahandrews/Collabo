import { atom } from "recoil";

export type ArchTool =
  | "none"
  | "select"
  | "wall"
  | "door"
  | "window"
  | "dimension";

export interface ArchState {
  tool: ArchTool;
  selectedId: string | null;
  grid: boolean;
  snap: boolean;
  view3d: boolean;
}

export const archAtom = atom<ArchState>({
  key: "arch",
  default: {
    tool: "none",
    selectedId: null,
    grid: true,
    snap: true,
    view3d: false,
  },
});
