import dynamic from "next/dynamic";

import { useRoom } from "@/common/recoil/room";

import RoomContextProvider from "../context/Room.context";
import AppRoomView from "./AppRoomView";
import Canvas from "./board/Canvas";
import MousePosition from "./board/MousePosition";
import MousesRenderer from "./board/MousesRenderer";
import MoveImage from "./board/MoveImage";
import SelectionBtns from "./board/SelectionBtns";
import Chat from "./chat/Chat";
import NameInput from "./NameInput";
import ArchToolBar from "./toolbar/ArchToolBar";
import ToolBar from "./toolbar/ToolBar";
import UserList from "./UserList";

const Arch3DView = dynamic(() => import("./arch3d/Arch3DView"), {
  ssr: false,
});

const Room = () => {
  const room = useRoom();

  if (!room.id) return <NameInput />;

  const isAppRoom = room.kind === "app";

  return (
    <RoomContextProvider>
      <div className="relative h-full w-full overflow-hidden">
        <UserList />
        {isAppRoom ? (
          <AppRoomView />
        ) : (
          <>
            <ToolBar />
            <ArchToolBar />
            <SelectionBtns />
            <MoveImage />
            <Canvas />
            <MousePosition />
            <MousesRenderer />
            <Arch3DView />
          </>
        )}
        <Chat />
      </div>
    </RoomContextProvider>
  );
};

export default Room;
