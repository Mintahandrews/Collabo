import {
  createContext,
  Dispatch,
  MutableRefObject,
  ReactChild,
  RefObject,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

import { MotionValue, useMotionValue } from "framer-motion";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import { toast } from "react-toastify";

import { COLORS_ARRAY } from "@/common/constants/colors";
import { socket } from "@/common/lib/socket";
import { useSetElements } from "@/common/recoil/elements";
import { useSetUsers } from "@/common/recoil/room";
import { useSetRoom, useRoom } from "@/common/recoil/room/room.hooks";
import type { DesignElement, ElementOp } from "@/common/types/elements";

export const roomContext = createContext<{
  x: MotionValue<number>;
  y: MotionValue<number>;
  undoRef: RefObject<HTMLButtonElement>;
  redoRef: RefObject<HTMLButtonElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  bgRef: RefObject<HTMLCanvasElement>;
  selectionRefs: RefObject<HTMLButtonElement[]>;
  minimapRef: RefObject<HTMLCanvasElement>;
  archStageRef: MutableRefObject<KonvaStage | null>;
  moveImage: { base64: string; x?: number; y?: number };
  setMoveImage: Dispatch<
    SetStateAction<{
      base64: string;
      x?: number | undefined;
      y?: number | undefined;
    }>
  >;
}>(null!);

const RoomContextProvider = ({ children }: { children: ReactChild }) => {
  const setRoom = useSetRoom();
  const { users } = useRoom();
  const usersRef = useRef(users);
  usersRef.current = users;
  const { handleAddUser, handleRemoveUser } = useSetUsers();
  const { setElements, applyOp } = useSetElements();

  const undoRef = useRef<HTMLButtonElement>(null);
  const redoRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const archStageRef = useRef<KonvaStage>(null);
  const selectionRefs = useRef<HTMLButtonElement[]>([]);

  const [moveImage, setMoveImage] = useState<{
    base64: string;
    x?: number;
    y?: number;
  }>({ base64: "" });

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  useEffect(() => {
    socket.on(
      "room",
      (
        room: Room,
        usersMovesToParse: string,
        usersToParse: string,
        elementsToParse: string
      ) => {
        const usersMoves = new Map<string, Move[]>(
          JSON.parse(usersMovesToParse)
        );
        const usersParsed = new Map<string, string>(JSON.parse(usersToParse));

        const newUsers = new Map<string, User>();

        usersParsed.forEach((name, id) => {
          if (id === socket.id) return;

          const index = [...usersParsed.keys()].indexOf(id);

          const color = COLORS_ARRAY[index % COLORS_ARRAY.length];

          newUsers.set(id, {
            name,
            color,
          });
        });

        setRoom((prev) => ({
          ...prev,
          users: newUsers,
          usersMoves,
          movesWithoutUser: room.drawn,
          kind: room.kind || "whiteboard",
          app: room.app,
        }));

        setElements(JSON.parse(elementsToParse) as DesignElement[]);
      }
    );

    socket.on("element_op", (op: ElementOp) => {
      applyOp(op);
    });

    socket.on("element_op_ack", (op: ElementOp) => {
      applyOp(op);
    });

    socket.on("app_ready", (app: RoomApp) => {
      setRoom((prev) => ({ ...prev, app }));
    });

    socket.on("app_stopped", () => {
      setRoom((prev) => ({ ...prev, app: undefined }));
    });

    socket.on("app_error", (msg: string) => {
      toast(msg, { position: "top-center", theme: "colored", type: "error" });
    });

    socket.on("new_user", (userId: string, username: string) => {
      toast(`${username} has joined the room.`, {
        position: "top-center",
        theme: "colored",
      });

      handleAddUser(userId, username);
    });

    socket.on("user_disconnected", (userId: string) => {
      toast(
        `${usersRef.current.get(userId)?.name || "Anonymous"} has left the room.`,
        {
        position: "top-center",
        theme: "colored",
      });

      handleRemoveUser(userId);
    });

    // Fetch the room doc once for every room kind (app rooms have no canvas)
    socket.emit("joined_room");

    return () => {
      socket.off("room");
      socket.off("new_user");
      socket.off("user_disconnected");
      socket.off("element_op");
      socket.off("element_op_ack");
      socket.off("app_ready");
      socket.off("app_stopped");
      socket.off("app_error");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <roomContext.Provider
      value={{
        x,
        y,
        bgRef,
        undoRef,
        redoRef,
        canvasRef,
        setMoveImage,
        moveImage,
        minimapRef,
        archStageRef,
        selectionRefs,
      }}
    >
      {children}
    </roomContext.Provider>
  );
};

export default RoomContextProvider;
