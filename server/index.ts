import { createServer } from "http";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/common/types/global";

import express from "express";
import next, { NextApiHandler } from "next";
import { Server } from "socket.io";
import { v4 } from "uuid";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });
const nextHandler: NextApiHandler = nextApp.getRequestHandler();

// Store rooms in memory (note: this will be cleared on serverless cold starts)
const rooms = new Map<string, Room>();

const addMove = (roomId: string, socketId: string, move: Move) => {
  const room = rooms.get(roomId)!;
  if (!room.users.has(socketId)) {
    room.usersMoves.set(socketId, [move]);
  }
  room.usersMoves.get(socketId)!.push(move);
};

const undoMove = (roomId: string, socketId: string) => {
  const room = rooms.get(roomId)!;
  room.usersMoves.get(socketId)!.pop();
};

const createSocketServer = (server: any) => {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: {
      origin:
        process.env.NODE_ENV === "production"
          ? process.env.NEXT_PUBLIC_APP_URL
          : "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    path: "/socket.io",
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000,
    allowEIO3: true,
  });

  // WebRTC signaling events
  io.on("connection", (socket) => {
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

    socket.on("disconnect", () => {
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
    };

    socket.on("create_room", (username: string) => {
      let roomId: string;
      do {
        roomId = Math.random().toString(36).substring(2, 6);
      } while (rooms.has(roomId));

      socket.join(roomId);
      rooms.set(roomId, {
        usersMoves: new Map([[socket.id, []]]),
        drawn: [],
        users: new Map([[socket.id, username]]),
      });

      io.to(socket.id).emit("created", roomId);
    });

    socket.on("check_room", (roomId: string) => {
      if (rooms.has(roomId)) socket.emit("room_exists", true);
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
        JSON.stringify([...room.users])
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
    });

    socket.on("undo", () => {
      const roomId = getRoomId();

      undoMove(roomId, socket.id);

      socket.broadcast.to(roomId).emit("user_undo", socket.id);
    });

    socket.on("mouse_move", (x: number, y: number) => {
      socket.broadcast.to(getRoomId()).emit("mouse_moved", x, y, socket.id);
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

// For development server
if (dev) {
  nextApp.prepare().then(() => {
    const app = express();
    const server = createServer(app);

    createSocketServer(server);

    app.get("/health", (_, res) => res.send("Healthy"));
    app.all("*", (req: any, res: any) => nextHandler(req, res));

    server.listen(port, () => {
      console.log(`> Ready on http://localhost:${port}`);
    });
  });
}

// For production serverless environment
const app = express();
const server = createServer(app);
createSocketServer(server);

app.get("/health", (_, res) => res.send("Healthy"));
app.all("*", (req: any, res: any) => nextHandler(req, res));

export default app;
