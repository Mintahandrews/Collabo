// Smoke test for the server-authoritative element document (Phase 0).
// Run the dev server first (npm run dev), then: node scripts/smoke-elements.mjs
//
// Verifies:
//   1. element_op add is acked to the sender and broadcast to others
//   2. element_op update/delete apply to the server doc
//   3. a late joiner receives the full element doc in the "room" event

import { io } from "socket.io-client";

const URL = process.env.SOCKET_URL || "http://localhost:3000";

const results = [];
const check = (name, cond) => {
  results.push([name, cond]);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
};

setTimeout(() => {
  console.error("Timed out waiting for server events");
  process.exit(1);
}, 20000);

const connect = () => {
  const s = io(URL, {
    transports: ["polling", "websocket"],
    forceNew: true,
    reconnection: false,
  });
  s.on("connect_error", (e) => console.error("connect_error:", e.message));
  return s;
};

const on = (sock, event) =>
  new Promise((resolve) => sock.once(event, (...args) => resolve(args)));

const wall = {
  id: "wall-1",
  type: "wall",
  path: [
    [0, 0],
    [400, 0],
    [400, 300],
  ],
  thickness: 200,
  height: 2800,
};

const run = async () => {
  const a = connect();
  const createdP = on(a, "created");
  a.emit("create_room", "alice");
  const [roomId] = await createdP;
  a.emit("joined_room");
  const [, , , elementsJsonA] = await on(a, "room");
  check("new room has empty element doc", JSON.parse(elementsJsonA).length === 0);

  // Second client joins
  const b = connect();
  const bJoined = on(b, "joined");
  b.emit("join_room", roomId, "bob");
  const [bRoomId] = await bJoined;
  check("bob joined the room", bRoomId === roomId);
  b.emit("joined_room");
  await on(b, "room");

  // A adds a wall element
  const ackP = on(a, "element_op_ack");
  const bOpP = on(b, "element_op");
  a.emit("element_op", { kind: "add", element: wall });
  const [ackOp] = await ackP;
  const [bOp, fromId] = await bOpP;
  check(
    "sender ack returns stored element",
    ackOp.kind === "add" &&
      ackOp.element.id === "wall-1" &&
      typeof ackOp.element.timestamp === "number" &&
      ackOp.element.createdBy === a.id
  );
  check(
    "broadcast reaches other user",
    bOp.kind === "add" && bOp.element.id === "wall-1" && fromId === a.id
  );

  // A updates the wall thickness
  const bUpdP = on(b, "element_op");
  a.emit("element_op", {
    kind: "update",
    id: "wall-1",
    patch: { thickness: 300 },
  });
  const [bUpd] = await bUpdP;
  check(
    "update op broadcast",
    bUpd.kind === "update" && bUpd.patch.thickness === 300
  );

  // A deletes, then re-adds so the doc has content for the late joiner
  const bDelP = on(b, "element_op");
  const delAckP = on(a, "element_op_ack");
  a.emit("element_op", { kind: "delete", id: "wall-1" });
  const [bDel] = await bDelP;
  check("delete op broadcast", bDel.kind === "delete" && bDel.id === "wall-1");
  await delAckP;
  const reAddAck = on(a, "element_op_ack");
  a.emit("element_op", { kind: "add", element: wall });
  await reAddAck;

  // Late joiner receives the doc snapshot
  const c = connect();
  const cJoined = on(c, "joined");
  c.emit("join_room", roomId, "carol");
  await cJoined;
  c.emit("joined_room");
  const [, , , elementsJsonC] = await on(c, "room");
  const docC = JSON.parse(elementsJsonC);
  check(
    "late joiner gets element doc",
    docC.length === 1 && docC[0].id === "wall-1" && docC[0].type === "wall"
  );

  // Invalid op is rejected (update non-existent element)
  let rejected = true;
  a.on("element_op_ack", () => {
    rejected = false;
  });
  a.emit("element_op", { kind: "update", id: "nope", patch: { x: 1 } });
  await new Promise((r) => setTimeout(r, 500));
  check("invalid op rejected (no ack)", rejected);

  a.disconnect();
  b.disconnect();
  c.disconnect();

  const failed = results.filter(([, ok]) => !ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
};

run().catch((err) => {
  console.error("Smoke test error:", err);
  process.exit(1);
});
