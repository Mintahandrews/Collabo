import { useRef, useState } from "react";

import { motion, AnimatePresence } from "framer-motion";
import { BiRectangle } from "react-icons/bi";
import { BsCircle } from "react-icons/bs";
import { CgShapeZigzag } from "react-icons/cg";
import { useClickAway } from "react-use";

import { useOptions } from "@/common/recoil/options";

import { EntryAnimation } from "../../animations/Entry.animations";

const ShapeSelector = () => {
  const [options, setOptions] = useOptions();

  const ref = useRef<HTMLDivElement>(null);

  const [opened, setOpened] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useClickAway(ref, () => setOpened(false));

  const handleShapeChange = (shape: Shape) => {
    setOptions((prev) => ({
      ...prev,
      shape,
    }));

    setOpened(false);
  };

  const isDisabled = options.mode === "select";

  return (
    <div className="relative flex items-center" ref={ref}>
      <button
        className={`btn-icon relative text-2xl ${
          isDisabled ? "cursor-not-allowed opacity-50" : ""
        }`}
        disabled={isDisabled}
        onClick={() => !isDisabled && setOpened((prev) => !prev)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {options.shape === "circle" && <BsCircle />}
        {options.shape === "rect" && <BiRectangle />}
        {options.shape === "line" && <CgShapeZigzag />}

        {showTooltip && (
          <div className="absolute -top-10 left-1/2 z-50 -translate-x-1/2 transform whitespace-nowrap rounded bg-black bg-opacity-75 py-1 px-2 text-xs text-white">
            {isDisabled ? "Not available in select mode" : "Choose shape"}
          </div>
        )}
      </button>

      <AnimatePresence>
        {opened && (
          <motion.div
            className="absolute left-14 z-10 flex gap-1 rounded-lg border bg-zinc-900 p-2 md:border-0"
            variants={EntryAnimation}
            initial="from"
            animate="to"
            exit="from"
          >
            <button
              className="btn-icon text-2xl"
              onClick={() => handleShapeChange("line")}
              aria-label="Line shape"
            >
              <CgShapeZigzag />
            </button>

            <button
              className="btn-icon text-2xl"
              onClick={() => handleShapeChange("rect")}
              aria-label="Rectangle shape"
            >
              <BiRectangle />
            </button>

            <button
              className="btn-icon text-2xl"
              onClick={() => handleShapeChange("circle")}
              aria-label="Circle shape"
            >
              <BsCircle />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShapeSelector;
