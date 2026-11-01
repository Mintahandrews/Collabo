import { useEffect, useState } from "react";

import { socket } from "@/common/lib/socket";
import { useElements } from "@/common/recoil/elements";
import { useRoom } from "@/common/recoil/room";

import { buildDxf } from "../helpers/dxf.helpers";
import { buildIfc } from "../helpers/ifc.helpers";

const APPS = [
  { key: "freecad", label: "FreeCAD" },
  { key: "blender", label: "Blender (Bonsai BIM)" },
];

const AppRoomView = () => {
  const room = useRoom();
  const elements = useElements();
  const [starting, setStarting] = useState<string | null>(null);

  // Push the room's exported design files into the shared /shared folder
  // so the streamed app can open them.
  const syncFiles = () => {
    const doc = elements.order
      .map((id) => elements.byId[id])
      .filter(Boolean);
    if (!doc.length) return;
    socket.emit("app_files", [
      { name: "design.ifc", content: buildIfc(elements) },
      { name: "plan.dxf", content: buildDxf(elements) },
      {
        name: "design.json",
        content: JSON.stringify({ version: 1, elements: doc }, null, 2),
      },
    ]);
  };

  useEffect(() => {
    const onStarting = (key: string) => setStarting(key);
    const onReady = () => setStarting(null);
    const onStopped = () => setStarting(null);
    const onError = () => setStarting(null);

    socket.on("app_starting", onStarting);
    socket.on("app_ready", onReady);
    socket.on("app_stopped", onStopped);
    socket.on("app_error", onError);
    return () => {
      socket.off("app_starting", onStarting);
      socket.off("app_ready", onReady);
      socket.off("app_stopped", onStopped);
      socket.off("app_error", onError);
    };
  }, []);

  if (room.app) {
    const url = `${window.location.protocol}//${window.location.hostname}:${room.app.port}`;
    return (
      <div className="relative h-full w-full">
        <iframe
          src={url}
          title={`${room.app.key} desktop`}
          className="h-full w-full border-0"
          allow="clipboard-read; clipboard-write"
        />
        <button
          className="btn-icon absolute right-3 top-3 z-10 rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-500"
          onClick={() => socket.emit("stop_app")}
        >
          Stop app
        </button>
        <button
          className="btn-icon absolute right-24 top-3 z-10 rounded-lg bg-black/60 px-3 py-2 text-sm text-white hover:bg-black/80"
          onClick={syncFiles}
          title="Push current exports to /shared in the app"
        >
          Sync files
        </button>
        {room.app.password && (
          <div className="absolute left-3 top-3 z-10 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white">
            Login: <b>abc</b> / <b>{room.app.password}</b>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-zinc-100">
      {starting ? (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-800" />
          <p className="text-lg font-medium text-zinc-700">
            Starting {starting}…
          </p>
          <p className="max-w-md text-center text-sm text-zinc-500">
            First launch pulls a multi-GB image — this can take several minutes.
          </p>
        </>
      ) : (
        <>
          <p className="text-lg font-medium text-zinc-700">
            Launch a desktop app for this room
          </p>
          <div className="flex gap-3">
            {APPS.map((app) => (
              <button
                key={app.key}
                className="rounded-lg bg-gray-800 px-6 py-3 text-white transition-colors hover:bg-gray-700"
                onClick={() => {
                  syncFiles();
                  setStarting(app.key);
                  socket.emit("start_app", app.key);
                }}
              >
                {app.label}
              </button>
            ))}
          </div>
          <p className="max-w-md text-center text-sm text-zinc-500">
            The app runs in a container on the server and is shared by everyone
            in the room — you all see and control the same session. Your
            architect-room exports land in <code>/shared</code> inside the app.
          </p>
        </>
      )}
    </div>
  );
};

export default AppRoomView;
