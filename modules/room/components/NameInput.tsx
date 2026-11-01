import { FormEvent, useEffect, useState } from "react";

import { useRouter } from "next/router";

import { socket } from "@/common/lib/socket";
import { useModal } from "@/common/recoil/modal";
import { useSetRoomId } from "@/common/recoil/room";
import NotFoundModal from "@/modules/home/modals/NotFound";

const NameInput = () => {
  const setRoomId = useSetRoomId();
  const { openModal } = useModal();

  const [name, setName] = useState("");
  const [roomKind, setRoomKind] = useState<RoomKind | null>(null);

  const router = useRouter();
  const roomId = (router.query.roomId || "").toString();

  useEffect(() => {
    if (!roomId) return;

    socket.emit("check_room", roomId);

    socket.on("room_exists", (exists: boolean, kind?: RoomKind) => {
      if (!exists) {
        router.push("/");
      } else setRoomKind(kind || "whiteboard");
    });

    // eslint-disable-next-line consistent-return
    return () => {
      socket.off("room_exists");
    };
  }, [roomId, router]);

  useEffect(() => {
    const handleJoined = (roomIdFromServer: string, failed?: boolean) => {
      if (failed) {
        router.push("/");
        openModal(<NotFoundModal id={roomIdFromServer} />);
      } else setRoomId(roomIdFromServer);
    };

    socket.on("joined", handleJoined);

    return () => {
      socket.off("joined", handleJoined);
    };
  }, [openModal, router, setRoomId]);

  const handleJoinRoom = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!name.trim()) {
      return;
    }

    socket.emit("join_room", roomId, name.trim());
  };

  return (
    <form
      className="flex min-h-screen flex-col items-center px-4 py-16 sm:py-24"
      onSubmit={handleJoinRoom}
    >
      <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
        Collaborator
      </h1>
      <h3 className="text-lg sm:text-2xl">Real-time design studio</h3>
      {roomKind && (
        <span className="mt-3 rounded-full bg-gray-800 px-4 py-1 text-sm font-medium capitalize text-white">
          {roomKind === "app" ? "Desktop app" : roomKind} room
        </span>
      )}

      <div className="mt-10 flex w-full max-w-sm flex-col gap-2">
        <label className="self-start font-bold leading-tight">
          Enter your name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="John Doe"
          className="w-full rounded-lg border border-gray-300 p-2 text-lg focus:border-gray-600 focus:outline-none"
          required
        />
      </div>

      <button
        type="submit"
        className="mt-6 w-full max-w-sm rounded-lg bg-gray-800 px-6 py-3 text-lg text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-opacity-50"
        disabled={!name.trim()}
      >
        Join Room
      </button>
    </form>
  );
};

export default NameInput;
