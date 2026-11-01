// Persistence smoke test (Phase 2).
// Usage:
//   node scripts/smoke-persistence.mjs create   -> prints roomId, writes a wall
//   node scripts/smoke-persistence.mjs verify <roomId> -> checks restored doc
//
// Between the two, restart the server.

import { io } from "socket.io-client";

const URL = process.env.SOCKET_URL || "http://localhost:3000";
const [action, roomIdArg] = process.argv.slice(2);

const connect = () =>
  io(URL, {
    transports: ["polling", "websocket"],
    forceNew: true,
    reconnection: false,
  });

const on = (sock, event) =>
  new Promise((resolve) => sock.once(event, (...args) => resolve(args)));

const wall = {
  id: "persist-wall",
  type: "wall",
  path: [
    [100, 100],
    [500, 100],
  ],
  thickness: 30,
  height: 280,
};

const run = async () => {
  const s = connect();

  if (action === "create") {
    const createdP = on(s, "created");
    s.emit("create_room", "alice", "architect");
    const [roomId] = await createdP;
    s.emit("joined_room");
    await on(s, "room");

    const ackP = on(s, "element_op_ack");
    s.emit("element_op", { kind: "add", element: wall });
    await ackP;

    // Wait past the debounce window so the write lands
    await new Promise((r) => setTimeout(r, 2500));
    console.log(`ROOM_ID=${roomId}`);
    s.disconnect();
    process.exit(0);
  }

  if (action === "verify") {
    const joinedP = on(s, "joined");
    s.emit("join_room", roomIdArg, "bob");
    const [joinedId] = await joinedP;
    if (joinedId !== roomIdArg) {
      console.error("FAIL room not found after restart:", joinedId);
      process.exit(1);
    }
    s.emit("joined_room");
    const [room, , , elementsJson] = await on(s, "room");
    const doc = JSON.parse(elementsJson);
    const ok =
      room.kind === "architect" &&
      doc.length === 1 &&
      doc[0].id === "persist-wall";
    console.log(ok ? "PASS  room restored with kind+elements" : "FAIL", {
      kind: room.kind,
      elements: doc,
    });
    s.disconnect();
    process.exit(ok ? 0 : 1);
  }

  console.error("usage: create | verify <roomId>");
  process.exit(1);
};

setTimeout(() => {
  console.error("timeout");
  process.exit(1);
}, 20000);

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
