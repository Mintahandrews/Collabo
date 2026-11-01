import {
  FaBuilding,
  FaCube,
  FaFileExport,
  FaFileImport,
  FaMagnet,
  FaMousePointer,
  FaTrash,
} from "react-icons/fa";
import { GiBrickWall, GiDoor } from "react-icons/gi";
import { MdOutlineWindow } from "react-icons/md";
import { RxDimensions, RxGrid } from "react-icons/rx";

import { useArch, useSetArch } from "@/common/recoil/arch";
import type { ArchTool } from "@/common/recoil/arch";
import { useElements, useSetElements } from "@/common/recoil/elements";
import { useRoom } from "@/common/recoil/room";

import { v4 } from "uuid";

import type { DesignElement } from "@/common/types/elements";

import { buildDxf } from "../../helpers/dxf.helpers";
import { buildIfc } from "../../helpers/ifc.helpers";

const TOOLS: { id: ArchTool; label: string; icon: JSX.Element }[] = [
  { id: "select", label: "Select", icon: <FaMousePointer /> },
  { id: "wall", label: "Wall", icon: <GiBrickWall /> },
  { id: "door", label: "Door", icon: <GiDoor /> },
  { id: "window", label: "Window", icon: <MdOutlineWindow /> },
  { id: "dimension", label: "Dimension", icon: <RxDimensions /> },
];

const ArchToolBar = () => {
  const room = useRoom();
  const { tool, selectedId, grid, snap, view3d } = useArch();
  const { setTool, toggleGrid, toggleSnap, toggleView3d, setSelectedId } =
    useSetArch();
  const elements = useElements();
  const { emitElementOp } = useSetElements();

  const handleExportDxf = () => {
    const dxf = buildDxf(elements);
    const blob = new Blob([dxf], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plan.dxf";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportIfc = () => {
    const ifc = buildIfc(elements);
    const blob = new Blob([ifc], { type: "application/x-step" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "design.ifc";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const doc = JSON.parse(reader.result as string);
        const list: DesignElement[] = doc.elements || [];
        const idMap = new Map<string, string>();
        list.forEach((el) => idMap.set(el.id, v4()));
        list.forEach((el) => {
          const mapped = { ...el, id: idMap.get(el.id)! } as DesignElement;
          if (
            (mapped.type === "door" || mapped.type === "window") &&
            mapped.wallId
          ) {
            mapped.wallId = idMap.get(mapped.wallId) || mapped.wallId;
          }
          delete mapped.createdBy;
          delete mapped.timestamp;
          emitElementOp({ kind: "add", element: mapped });
        });
      } catch {
        /* invalid file */
      }
    };
    reader.readAsText(file);
  };

  if (room.kind !== "architect") return null;

  const handleDelete = () => {
    if (!selectedId) return;
    emitElementOp({ kind: "delete", id: selectedId });
    setSelectedId(null);
  };

  const btnClass = (active: boolean) =>
    `btn-icon text-2xl transition-colors ${
      active ? "rounded-md bg-blue-600 text-white" : "text-zinc-300 hover:text-white"
    }`;

  return (
    <div className="absolute right-2 top-1/2 z-50 flex -translate-y-1/2 flex-col items-center gap-3 rounded-lg bg-zinc-900 p-3 text-white shadow-lg sm:right-4 sm:p-4">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
        Arch
      </span>

      {TOOLS.map(({ id, label, icon }) => (
        <button
          key={id}
          className={btnClass(tool === id)}
          onClick={() => setTool(id)}
          title={label}
          aria-label={label}
        >
          {icon}
        </button>
      ))}

      <div className="h-px w-full bg-white/30" />

      <button
        className={btnClass(grid)}
        onClick={toggleGrid}
        title="Toggle grid"
        aria-label="Toggle grid"
      >
        <RxGrid />
      </button>
      <button
        className={btnClass(snap)}
        onClick={toggleSnap}
        title="Toggle snapping"
        aria-label="Toggle snapping"
      >
        <FaMagnet />
      </button>

      <div className="h-px w-full bg-white/30" />

      <button
        className={btnClass(view3d)}
        onClick={toggleView3d}
        title="Toggle 3D preview"
        aria-label="Toggle 3D preview"
      >
        <FaCube />
      </button>

      <button
        className="btn-icon text-2xl text-zinc-300 hover:text-white"
        onClick={handleExportDxf}
        title="Export plan as DXF (AutoCAD)"
        aria-label="Export plan as DXF"
      >
        <FaFileExport />
      </button>

      <button
        className="btn-icon text-2xl text-zinc-300 hover:text-white"
        onClick={handleExportIfc}
        title="Export BIM model as IFC (Revit/Bonsai)"
        aria-label="Export BIM model as IFC"
      >
        <FaBuilding />
      </button>

      <label
        className="btn-icon cursor-pointer text-2xl text-zinc-300 hover:text-white"
        title="Import design JSON"
        aria-label="Import design JSON"
      >
        <FaFileImport />
        <input
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportJson(f);
            e.target.value = "";
          }}
        />
      </label>

      <div className="h-px w-full bg-white/30" />

      <button
        className={`btn-icon text-2xl ${
          selectedId
            ? "text-red-400 hover:text-red-300"
            : "cursor-not-allowed text-zinc-600"
        }`}
        onClick={handleDelete}
        disabled={!selectedId}
        title="Delete selected element"
        aria-label="Delete selected element"
      >
        <FaTrash />
      </button>
    </div>
  );
};

export default ArchToolBar;
