import { useEffect } from "react";

import { AiOutlineSelect } from "react-icons/ai";
import { BsPencilFill } from "react-icons/bs";
import { FaEraser } from "react-icons/fa";

import { useSetArch } from "@/common/recoil/arch";
import { useOptions, useSetSelection } from "@/common/recoil/options";

const ModePicker = () => {
  const [options, setOptions] = useOptions();
  const { clearSelection } = useSetSelection();
  const { setTool } = useSetArch();

  const pickMode = (mode: CtxMode) => {
    setOptions((prev) => ({ ...prev, mode }));
    // Deactivate arch tools so the overlay stops blocking the canvas
    setTool("none");
  };

  useEffect(() => {
    clearSelection();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.mode]);

  return (
    <>
      <button
        className={`btn-icon text-xl ${
          options.mode === "draw" && "bg-green-400"
        }`}
        onClick={() => pickMode("draw")}
      >
        <BsPencilFill />
      </button>

      <button
        className={`btn-icon text-xl ${
          options.mode === "eraser" && "bg-green-400"
        }`}
        onClick={() => pickMode("eraser")}
      >
        <FaEraser />
      </button>

      <button
        className={`btn-icon text-2xl ${
          options.mode === "select" && "bg-green-400"
        }`}
        onClick={() => pickMode("select")}
      >
        <AiOutlineSelect />
      </button>
    </>
  );
};

export default ModePicker;
