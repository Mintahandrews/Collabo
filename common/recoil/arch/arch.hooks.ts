import { useRecoilState, useRecoilValue } from "recoil";

import { archAtom, ArchTool } from "./arch.atom";

export const useArch = () => {
  return useRecoilValue(archAtom);
};

export const useSetArch = () => {
  const [arch, setArch] = useRecoilState(archAtom);

  const setTool = (tool: ArchTool) => {
    setArch((prev) => ({
      ...prev,
      tool: prev.tool === tool ? "none" : tool,
      selectedId: null,
    }));
  };

  const setSelectedId = (selectedId: string | null) => {
    setArch((prev) => ({ ...prev, selectedId }));
  };

  const toggleGrid = () => {
    setArch((prev) => ({ ...prev, grid: !prev.grid }));
  };

  const toggleSnap = () => {
    setArch((prev) => ({ ...prev, snap: !prev.snap }));
  };

  const toggleView3d = () => {
    setArch((prev) => ({ ...prev, view3d: !prev.view3d }));
  };

  return { arch, setTool, setSelectedId, toggleGrid, toggleSnap, toggleView3d };
};
