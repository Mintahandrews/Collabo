import { useEffect, useState } from "react";

import { motion } from "framer-motion";
import { useRouter } from "next/router";
import { FiChevronRight } from "react-icons/fi";
import { HiOutlineDownload } from "react-icons/hi";
import { ImExit } from "react-icons/im";
import { IoIosShareAlt } from "react-icons/io";

import { CANVAS_SIZE } from "@/common/constants/canvasSize";
import { DEFAULT_EASE } from "@/common/constants/easings";
import { useViewportSize } from "@/common/hooks/useViewportSize";
import { useModal } from "@/common/recoil/modal";

import { useRefs } from "../../hooks/useRefs";
import ShareModal from "../../modals/ShareModal";
import BackgroundPicker from "./BackgoundPicker";
import ColorPicker from "./ColorPicker";
import HistoryBtns from "./HistoryBtns";
import ImagePicker from "./ImagePicker";
import LineWidthPicker from "./LineWidthPicker";
import ModePicker from "./ModePicker";
import ShapeSelector from "./ShapeSelector";

const ToolBar = () => {
  const { canvasRef, bgRef } = useRefs();
  const { openModal } = useModal();
  const { width } = useViewportSize();

  const [opened, setOpened] = useState(false);
  const [toolTip, setToolTip] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    if (width >= 1024) setOpened(true);
    else setOpened(false);
  }, [width]);

  const handleExit = () => router.push("/");

  const handleDownload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_SIZE.width;
    canvas.height = CANVAS_SIZE.height;

    const tempCtx = canvas.getContext("2d");

    if (tempCtx && canvasRef.current && bgRef.current) {
      tempCtx.drawImage(bgRef.current, 0, 0);
      tempCtx.drawImage(canvasRef.current, 0, 0);
    }

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "canvas.png";
    link.click();
  };

  const handleShare = () => openModal(<ShareModal />);

  return (
    <>
      <motion.button
        className="btn-icon absolute bottom-1/2 -left-2 z-50 h-10 w-10 rounded-full bg-black text-2xl transition-none lg:hidden"
        animate={{ rotate: opened ? 0 : 180 }}
        transition={{ duration: 0.25, ease: DEFAULT_EASE }}
        onClick={() => setOpened(!opened)}
        aria-label={opened ? "Close toolbar" : "Open toolbar"}
      >
        <FiChevronRight />
      </motion.button>
      <motion.div
        className="absolute left-10 top-[50%] z-50 grid grid-cols-2 items-center gap-5 rounded-lg bg-zinc-900 p-5 text-white shadow-lg 2xl:grid-cols-1"
        animate={{
          x: opened ? 0 : -160,
          y: "-50%",
          opacity: opened ? 1 : 0.8,
        }}
        transition={{
          duration: 0.25,
          ease: DEFAULT_EASE,
        }}
        aria-hidden={!opened}
      >
        <HistoryBtns />

        <div className="h-px w-full bg-white 2xl:hidden" />
        <div className="h-px w-full bg-white" />

        <ShapeSelector />
        <ColorPicker />
        <LineWidthPicker />
        <ModePicker />
        <ImagePicker />

        <div className="2xl:hidden"></div>
        <div className="h-px w-full bg-white 2xl:hidden" />
        <div className="h-px w-full bg-white" />

        <BackgroundPicker />
        <div className="relative">
          <button
            className="btn-icon text-2xl"
            onClick={handleShare}
            onMouseEnter={() => setToolTip("Share")}
            onMouseLeave={() => setToolTip(null)}
            aria-label="Share whiteboard"
          >
            <IoIosShareAlt />
          </button>
          {toolTip === "Share" && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 transform whitespace-nowrap rounded bg-black bg-opacity-75 py-1 px-2 text-xs text-white">
              Share
            </div>
          )}
        </div>
        <div className="relative">
          <button
            className="btn-icon text-2xl"
            onClick={handleDownload}
            onMouseEnter={() => setToolTip("Download")}
            onMouseLeave={() => setToolTip(null)}
            aria-label="Download whiteboard"
          >
            <HiOutlineDownload />
          </button>
          {toolTip === "Download" && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 transform whitespace-nowrap rounded bg-black bg-opacity-75 py-1 px-2 text-xs text-white">
              Download
            </div>
          )}
        </div>
        <div className="relative">
          <button
            className="btn-icon text-xl"
            onClick={handleExit}
            onMouseEnter={() => setToolTip("Exit")}
            onMouseLeave={() => setToolTip(null)}
            aria-label="Exit whiteboard"
          >
            <ImExit />
          </button>
          {toolTip === "Exit" && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 transform whitespace-nowrap rounded bg-black bg-opacity-75 py-1 px-2 text-xs text-white">
              Exit
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
};

export default ToolBar;
