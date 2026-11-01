import { FormEvent, useEffect, useState } from "react";

import { useRouter } from "next/router";
import { FaChalkboard, FaDesktop } from "react-icons/fa";
import { GiBrickWall } from "react-icons/gi";

import { socket } from "@/common/lib/socket";
import { useModal } from "@/common/recoil/modal";
import { useSetRoomId } from "@/common/recoil/room";

import NotFoundModal from "../modals/NotFound";

const ROOM_TYPES: {
  kind: RoomKind;
  label: string;
  desc: string;
  icon: JSX.Element;
}[] = [
  {
    kind: "whiteboard",
    label: "Whiteboard",
    desc: "Freehand drawing & shapes",
    icon: <FaChalkboard />,
  },
  {
    kind: "architect",
    label: "Architect",
    desc: "Walls, doors, dimensions",
    icon: <GiBrickWall />,
  },
  {
    kind: "app",
    label: "Desktop App",
    desc: "Shared FreeCAD/Blender",
    icon: <FaDesktop />,
  },
];

const Home = () => {
  const { openModal } = useModal();
  const setAtomRoomId = useSetRoomId();

  const [roomId, setRoomId] = useState("");
  const [username, setUsername] = useState("");
  const [roomKind, setRoomKind] = useState<RoomKind>("whiteboard");

  const router = useRouter();

  useEffect(() => {
    document.body.style.backgroundColor = "white";
  }, []);

  useEffect(() => {
    socket.on("created", (roomIdFromServer: string) => {
      setAtomRoomId(roomIdFromServer);
      router.push(roomIdFromServer);
    });

    const handleJoinedRoom = (roomIdFromServer: string, failed?: boolean) => {
      if (!failed) {
        setAtomRoomId(roomIdFromServer);
        router.push(roomIdFromServer);
      } else {
        openModal(<NotFoundModal id={roomId} />);
      }
    };

    socket.on("joined", handleJoinedRoom);

    return () => {
      socket.off("created");
      socket.off("joined", handleJoinedRoom);
    };
  }, [openModal, roomId, router, setAtomRoomId]);

  useEffect(() => {
    socket.emit("leave_room");
    setAtomRoomId("");
  }, [setAtomRoomId]);

  const handleCreateRoom = () => {
    socket.emit("create_room", username, roomKind);
  };

  const handleJoinRoom = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (roomId) socket.emit("join_room", roomId, username);
  };

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-16 sm:py-24">
      <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
        Collaborator
      </h1>
      <h3 className="text-lg sm:text-2xl">Real-time design studio</h3>

      <div className="mt-10 flex w-full max-w-sm flex-col gap-2">
        <label className="self-start font-bold leading-tight">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your name"
          className="w-full rounded-lg border border-gray-300 p-2 text-lg focus:border-gray-600 focus:outline-none"
          required
        />
      </div>

      <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
        <label className="self-start font-bold leading-tight">
          Room ID (optional)
        </label>
        <form onSubmit={handleJoinRoom} className="flex gap-2">
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Enter room id"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 p-2 text-lg focus:border-gray-600 focus:outline-none"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-gray-800 px-4 py-2 text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:bg-opacity-50"
            disabled={!username || !roomId}
          >
            Join
          </button>
        </form>
      </div>

      <div className="mt-8 flex w-full max-w-2xl flex-col gap-2">
        <label className="self-start font-bold leading-tight">
          New room type
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup">
          {ROOM_TYPES.map(({ kind, label, desc, icon }) => {
            const selected = roomKind === kind;
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setRoomKind(kind)}
                className={`flex items-start gap-3 rounded-lg border-2 px-4 py-3 text-left transition-colors ${
                  selected
                    ? "border-gray-800 bg-gray-800 text-white"
                    : "border-gray-300 bg-white hover:border-gray-500"
                }`}
              >
                <span className="mt-0.5 text-xl" aria-hidden>
                  {icon}
                </span>
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-sm opacity-75">{desc}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500">
          Room type only applies when creating — joining uses the room&apos;s own
          type.
        </p>
      </div>

      <div className="mt-8 self-center">
        <button
          type="button"
          className="rounded-lg bg-gray-800 px-8 py-3 text-lg text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-opacity-50"
          onClick={handleCreateRoom}
          disabled={!username}
        >
          Create Room
        </button>
      </div>
    </div>
  );
};

export default Home;
