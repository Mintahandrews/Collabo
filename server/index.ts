import { createServer } from "http";
import fs from "fs";
import path from "path";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/common/types/global";
import type { DesignElement, ElementOp } from "@/common/types/elements";

import {
  dockerAvailable,
  reapOrphanedContainers,
  startAppContainer,
  stopAppContainer,
  waitForApp,
} from "./app-containers";

import express from "express";
import next, { NextApiHandler } from "next";
import { Server } from "socket.io";
import { v4 } from "uuid";
import { renderSocketConfig, healthCheckPath } from "./render-config";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";

console.log(`Starting Collabo server in ${dev ? "development" : "production"} mode on port ${port}`);
console.log(`Using render config: ${JSON.stringify(renderSocketConfig)}`);

// Use proper directory resolution for Next.js in production vs development
// This ensures Next.js can find its assets when running from the build directory
const nextApp = next({ 
  dev,
  dir: process.cwd() // Use current working directory as base
});
const nextHandler: NextApiHandler = nextApp.getRequestHandler();

// Store rooms in memory (note: this will be cleared on serverless cold starts)
const rooms = new Map<string, Room>();

// ---------------------------------------------------------------------------
// Room persistence (JSON files under DATA_DIR, debounced writes)
// ---------------------------------------------------------------------------

const DATA_DIR =
  process.env.DATA_DIR || path.join(process.cwd(), "data", "rooms");
const saveTimers = new Map<string, NodeJS.Timeout>();

const serializeRoom = (room: Room) =>
  JSON.stringify({
    usersMoves: [...room.usersMoves],
    users: [...room.users],
    drawn: room.drawn,
    elements: room.elements,
    kind: room.kind,
    savedAt: Date.now(),
  });

const persistRoom = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room) return;

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const file = path.join(DATA_DIR, `${roomId}.json`);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, serializeRoom(room));
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error(`[store] failed to persist room ${roomId}`, err);
  }
};

const scheduleSave = (roomId: string) => {
  const existing = saveTimers.get(roomId);
  if (existing) clearTimeout(existing);
  saveTimers.set(
    roomId,
    setTimeout(() => {
      saveTimers.delete(roomId);
      persistRoom(roomId);
    }, 1500)
  );
};

// Restored rooms keep the design (drawn moves + elements) but drop stale
// socket-id-keyed data so no ghost users appear.
const loadPersistedRooms = () => {
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }

  files.forEach((file) => {
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(DATA_DIR, file), "utf8")
      );
      const roomId = path.basename(file, ".json");
      const drawn = [...(data.drawn || [])];
      (data.usersMoves || []).forEach(
        ([, moves]: [string, Move[]]) => drawn.push(...moves)
      );

      rooms.set(roomId, {
        usersMoves: new Map(),
        users: new Map(),
        drawn,
        elements: data.elements || [],
        kind: data.kind === "architect" ? "architect" : "whiteboard",
      });
      console.log(
        `[store] restored room ${roomId} (${drawn.length} moves, ${
          (data.elements || []).length
        } elements)`
      );
    } catch (err) {
      console.error(`[store] failed to load ${file}`, err);
    }
  });
};

const addMove = (roomId: string, socketId: string, move: Move) => {
  const room = rooms.get(roomId);
  if (!room) return;
  if (!room.users.has(socketId)) {
    room.usersMoves.set(socketId, [move]);
  }
  room.usersMoves.get(socketId)!.push(move);
};

const undoMove = (roomId: string, socketId: string) => {
  const room = rooms.get(roomId);
  if (!room) return;
  room.usersMoves.get(socketId)!.pop();
};

// Applies an element op to the room's shared design document.
// Returns the op as it should be broadcast, or null if invalid.
const applyElementOp = (
  room: Room,
  op: ElementOp,
  userId: string
): ElementOp | null => {
  if (op.kind === "add") {
    const { element } = op;
    if (!element || !element.id || !element.type) return null;
    if (room.elements.some((el) => el.id === element.id)) return null;

    const stored: DesignElement = {
      ...element,
      createdBy: userId,
      timestamp: Date.now(),
    };
    room.elements.push(stored);

    return { kind: "add", element: stored };
  }

  if (op.kind === "update") {
    const element = room.elements.find((el) => el.id === op.id);
    if (!element || !op.patch || typeof op.patch !== "object") return null;

    Object.assign(element, op.patch, { id: element.id, type: element.type });

    return { kind: "update", id: op.id, patch: op.patch };
  }

  if (op.kind === "delete") {
    const index = room.elements.findIndex((el) => el.id === op.id);
    if (index === -1) return null;

    room.elements.splice(index, 1);

    return { kind: "delete", id: op.id };
  }

  return null;
};

const createSocketServer = (server: any) => {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, renderSocketConfig);

  // Log engine.io handshake failures (useful on Render)
  io.engine.on("connection_error", (err: any) => {
    console.error(`[engine] connection_error code=${err.code} message=${err.message}`, err.context || {});
  });

  // WebRTC signaling events
  io.on("connection", (socket) => {
    // Connection diagnostics
    try {
      const t = socket.conn.transport.name;
      console.log(
        `[socket] connect id=${socket.id} transport=${t} ip=${socket.handshake.address} origin=${(socket.handshake.headers as any)?.origin || 'n/a'}`
      );
      socket.conn.on("upgrade", (newTransport: any) => {
        console.log(`[socket] upgrade id=${socket.id} transport=${newTransport.name}`);
      });
    } catch (e) {
      console.warn("[socket] unable to log transport details", e);
    }

    socket.on("error", (err: any) => {
      console.error(`[socket] error id=${socket.id} transport=${socket.conn.transport.name}`, err);
    });
    socket.on(
      "webrtc_offer",
      (offer: RTCSessionDescriptionInit, targetId: string) => {
        if (!offer || !targetId) return;
        socket.to(targetId).emit("webrtc_offer", offer, socket.id);
      }
    );

    socket.on(
      "webrtc_answer",
      (answer: RTCSessionDescriptionInit, targetId: string) => {
        if (!answer || !targetId) return;
        socket.to(targetId).emit("webrtc_answer", answer, socket.id);
      }
    );

    socket.on(
      "webrtc_ice_candidate",
      (candidate: RTCIceCandidateInit, targetId: string) => {
        if (!candidate || !targetId) return;
        socket.to(targetId).emit("webrtc_ice_candidate", candidate, socket.id);
      }
    );

    socket.on("disconnect", (reason: string) => {
      console.log(`[socket] disconnect id=${socket.id} reason=${reason}`);
      const rooms = [...socket.rooms];
      rooms.forEach((room) => {
        if (room !== socket.id) {
          socket.to(room).emit("user_disconnected", socket.id);
        }
      });
    });

    const getRoomId = () => {
      const joinedRoom = [...socket.rooms].find((room) => room !== socket.id);
      if (!joinedRoom) return socket.id;
      return joinedRoom;
    };

    const leaveRoom = (roomId: string, socketId: string) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const userMoves = room.usersMoves.get(socketId);
      if (userMoves) room.drawn.push(...userMoves);
      room.users.delete(socketId);
      socket.leave(roomId);
      scheduleSave(roomId);

      // No one left -> shut down the streamed app, if any
      if (room.users.size === 0 && room.app) {
        void stopAppContainer(room.app.containerId);
        delete room.app;
      }
    };

    socket.on("create_room", (username: string, kind?: RoomKind) => {
      let roomId: string;
      do {
        roomId = Math.random().toString(36).substring(2, 6);
      } while (rooms.has(roomId));

      socket.join(roomId);
      rooms.set(roomId, {
        usersMoves: new Map([[socket.id, []]]),
        drawn: [],
        users: new Map([[socket.id, username]]),
        elements: [],
        kind: kind === "architect" ? "architect" : "whiteboard",
      });

      io.to(socket.id).emit("created", roomId);
      scheduleSave(roomId);
    });

    socket.on("check_room", (roomId: string) => {
      const room = rooms.get(roomId);
      if (room) socket.emit("room_exists", true, room.kind);
      else socket.emit("room_exists", false);
    });

    socket.on("join_room", (roomId: string, username: string) => {
      const room = rooms.get(roomId);

      if (room && room.users.size < 12) {
        socket.join(roomId);

        room.users.set(socket.id, username);
        room.usersMoves.set(socket.id, []);

        io.to(socket.id).emit("joined", roomId);
      } else io.to(socket.id).emit("joined", "", true);
    });

    socket.on("joined_room", () => {
      const roomId = getRoomId();

      const room = rooms.get(roomId);
      if (!room) return;

      io.to(socket.id).emit(
        "room",
        room,
        JSON.stringify([...room.usersMoves]),
        JSON.stringify([...room.users]),
        JSON.stringify(room.elements)
      );

      socket.broadcast
        .to(roomId)
        .emit("new_user", socket.id, room.users.get(socket.id) || "Anonymous");
    });

    socket.on("leave_room", () => {
      const roomId = getRoomId();
      leaveRoom(roomId, socket.id);

      io.to(roomId).emit("user_disconnected", socket.id);
    });

    socket.on("draw", (move: Move) => {
      const roomId = getRoomId();

      const timestamp = Date.now();

      // eslint-disable-next-line no-param-reassign
      move.id = v4();

      addMove(roomId, socket.id, { ...move, timestamp });

      io.to(socket.id).emit("your_move", { ...move, timestamp });

      socket.broadcast
        .to(roomId)
        .emit("user_draw", { ...move, timestamp }, socket.id);

      scheduleSave(roomId);
    });

    socket.on("undo", () => {
      const roomId = getRoomId();

      undoMove(roomId, socket.id);

      socket.broadcast.to(roomId).emit("user_undo", socket.id);
      scheduleSave(roomId);
    });

    socket.on("element_op", (op: ElementOp) => {
      const roomId = getRoomId();
      const room = rooms.get(roomId);
      if (!room || !op) return;

      const applied = applyElementOp(room, op, socket.id);
      if (!applied) return;

      io.to(socket.id).emit("element_op_ack", applied);
      socket.broadcast.to(roomId).emit("element_op", applied, socket.id);

      // Cascade: deleting a wall also deletes its doors/windows
      if (op.kind === "delete") {
        room.elements
          .filter(
            (el) =>
              (el.type === "door" || el.type === "window") &&
              el.wallId === op.id
          )
          .forEach((child) => {
            const childOp = applyElementOp(
              room,
              { kind: "delete", id: child.id },
              socket.id
            );
            if (childOp) {
              io.to(socket.id).emit("element_op_ack", childOp);
              socket.broadcast
                .to(roomId)
                .emit("element_op", childOp, socket.id);
            }
          });
      }

      scheduleSave(roomId);
    });

    socket.on("mouse_move", (x: number, y: number) => {
      socket.broadcast.to(getRoomId()).emit("mouse_moved", x, y, socket.id);
    });

    // --- Streamed desktop app (per-room container) ---
    socket.on("start_app", (appKey: string) => {
      const roomId = getRoomId();
      const room = rooms.get(roomId);
      if (!room) return;

      if (room.app) {
        socket.emit("app_ready", room.app);
        return;
      }

      void (async () => {
        try {
          if (!(await dockerAvailable())) {
            socket.emit(
              "app_error",
              "Docker is not running on the server (start Docker Desktop)."
            );
            return;
          }

          io.to(roomId).emit("app_starting", appKey);
          const { containerId, port, password } = await startAppContainer(
            roomId,
            appKey
          );
          room.app = { key: appKey, image: appKey, containerId, port, password };

          const ready = await waitForApp(port);
          if (!ready) {
            socket.emit(
              "app_error",
              "App container started but is not responding yet — try reloading the room."
            );
          }
          io.to(roomId).emit("app_ready", room.app);
        } catch (err) {
          console.error("[apps] start failed", err);
          io.to(roomId).emit(
            "app_error",
            `Failed to start app container: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      })();
    });

    socket.on("stop_app", () => {
      const roomId = getRoomId();
      const room = rooms.get(roomId);
      if (!room?.app) return;

      void stopAppContainer(room.app.containerId);
      delete room.app;
      io.to(roomId).emit("app_stopped");
    });

    socket.on("send_msg", (msg: string) => {
      io.to(getRoomId()).emit("new_msg", socket.id, msg);
    });

    socket.on("disconnecting", () => {
      const roomId = getRoomId();
      leaveRoom(roomId, socket.id);

      io.to(roomId).emit("user_disconnected", socket.id);
    });
  });

  return io;
};

// Shared app setup
const setupApp = async () => {
  const app = express();
  const server = createServer(app);

  loadPersistedRooms();
  void reapOrphanedContainers();
  
  // Tune Node HTTP server timeouts for proxies (Cloudflare/Render)
  // Helps prevent sporadic 502s and premature connection closes on long polling / upgrades
  server.keepAliveTimeout = 61_000; // must be < headersTimeout
  server.headersTimeout = 65_000;   // keep a small buffer above keepAliveTimeout
  // Disable per-request timeouts to support long-lived polling requests
  // (cast to any for older @types/node compatibility)
  (server as any).requestTimeout = 0;
  
  // Create socket server
  const io = createSocketServer(server);

  // Health check endpoint for Render
  app.get(healthCheckPath, (_, res) => {
    res.status(200).send({
      status: "Healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });
  
  // Ephemeral TURN credentials (Twilio Network Traversal Service)
  app.get("/api/turn-credentials", async (_: any, res: any) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return res
        .status(500)
        .json({ error: "Twilio credentials not configured" });
    }
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`;
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const ttlSeconds = parseInt(process.env.TWILIO_TTL_SECONDS || "3600", 10);
      const form = new URLSearchParams();
      if (!Number.isNaN(ttlSeconds) && ttlSeconds > 0) {
        // Twilio expects capitalized parameter names for form posts
        form.set("Ttl", String(ttlSeconds));
      }
      const twilioRes = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      });
      if (!twilioRes.ok) {
        const text = await twilioRes.text();
        console.error(
          "[turn-credentials] Twilio error",
          twilioRes.status,
          text
        );
        return res.status(502).json({ error: "Failed to fetch TURN credentials" });
      }
      const data: any = await twilioRes.json();
      return res
        .status(200)
        .json({ iceServers: data.ice_servers, ttl: data.ttl });
    } catch (err) {
      console.error("[turn-credentials] Failed", err);
      return res
        .status(500)
        .json({ error: "Failed to fetch TURN credentials" });
    }
  });
  
  // Handle all Next.js requests
  app.all("*", (req: any, res: any) => nextHandler(req, res));
  
  return { app, server, io };
};

// For development server
if (dev) {
  nextApp.prepare().then(async () => {
    const { app, server } = await setupApp();
    
    server.listen(port, () => {
      console.log(`🚀 Server listening at http://localhost:${port} in ${process.env.NODE_ENV} mode`);
      console.log(`Health check endpoint available at: ${healthCheckPath}`);
      console.log(`WebSocket server running on ws://localhost:${port}`);
    });
  });
} else {
  // For production environment (including Render)
  nextApp.prepare().then(async () => {
    const { app, server } = await setupApp();
    
    server.listen(port, () => {
      console.log(`> Production server ready on port ${port}`);
      console.log(`> Environment: ${process.env.NODE_ENV}`);
      console.log(`> App URL: ${process.env.NEXT_PUBLIC_APP_URL || 'Not configured'}`);
    });
  });
}

// For serverless environments
const app = express();
const server = createServer(app);
createSocketServer(server);

// Health check endpoint
app.get(healthCheckPath, (_: any, res: any) => {
  res.status(200).send({
    status: "Healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Ephemeral TURN credentials (Twilio Network Traversal Service)
app.get("/api/turn-credentials", async (_: any, res: any) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return res.status(500).json({ error: "Twilio credentials not configured" });
  }
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const ttlSeconds = parseInt(process.env.TWILIO_TTL_SECONDS || "3600", 10);
    const form = new URLSearchParams();
    if (!Number.isNaN(ttlSeconds) && ttlSeconds > 0) {
      form.set("Ttl", String(ttlSeconds));
    }
    const twilioRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    if (!twilioRes.ok) {
      const text = await twilioRes.text();
      console.error("[turn-credentials] Twilio error", twilioRes.status, text);
      return res.status(502).json({ error: "Failed to fetch TURN credentials" });
    }
    const data: any = await twilioRes.json();
    return res.status(200).json({ iceServers: data.ice_servers, ttl: data.ttl });
  } catch (err) {
    console.error("[turn-credentials] Failed", err);
    return res.status(500).json({ error: "Failed to fetch TURN credentials" });
  }
});

app.all("*", (req: any, res: any) => nextHandler(req, res));

export default app;
