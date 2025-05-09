"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const express_1 = __importDefault(require("express"));
const next_1 = __importDefault(require("next"));
const socket_io_1 = require("socket.io");
const uuid_1 = require("uuid");
const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const nextApp = (0, next_1.default)({ dev });
const nextHandler = nextApp.getRequestHandler();
nextApp.prepare().then(async () => {
    const app = (0, express_1.default)();
    const server = (0, http_1.createServer)(app);
    const io = new socket_io_1.Server(server);
    // WebRTC signaling events
    io.on("connection", (socket) => {
        socket.on("webrtc_offer", (offer, targetId) => {
            if (!offer || !targetId)
                return;
            socket.to(targetId).emit("webrtc_offer", offer, socket.id);
        });
        socket.on("webrtc_answer", (answer, targetId) => {
            if (!answer || !targetId)
                return;
            socket.to(targetId).emit("webrtc_answer", answer, socket.id);
        });
        socket.on("webrtc_ice_candidate", (candidate, targetId) => {
            if (!candidate || !targetId)
                return;
            socket.to(targetId).emit("webrtc_ice_candidate", candidate, socket.id);
        });
        socket.on("disconnect", () => {
            const rooms = [...socket.rooms];
            rooms.forEach((room) => {
                if (room !== socket.id) {
                    socket.to(room).emit("user_disconnected", socket.id);
                }
            });
        });
    });
    app.get("/health", async (_, res) => {
        res.send("Healthy");
    });
    const rooms = new Map();
    const addMove = (roomId, socketId, move) => {
        const room = rooms.get(roomId);
        if (!room.users.has(socketId)) {
            room.usersMoves.set(socketId, [move]);
        }
        room.usersMoves.get(socketId).push(move);
    };
    const undoMove = (roomId, socketId) => {
        const room = rooms.get(roomId);
        room.usersMoves.get(socketId).pop();
    };
    io.on("connection", (socket) => {
        const getRoomId = () => {
            const joinedRoom = [...socket.rooms].find((room) => room !== socket.id);
            if (!joinedRoom)
                return socket.id;
            return joinedRoom;
        };
        const leaveRoom = (roomId, socketId) => {
            const room = rooms.get(roomId);
            if (!room)
                return;
            const userMoves = room.usersMoves.get(socketId);
            if (userMoves)
                room.drawn.push(...userMoves);
            room.users.delete(socketId);
            socket.leave(roomId);
        };
        socket.on("create_room", (username) => {
            let roomId;
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
        socket.on("check_room", (roomId) => {
            if (rooms.has(roomId))
                socket.emit("room_exists", true);
            else
                socket.emit("room_exists", false);
        });
        socket.on("join_room", (roomId, username) => {
            const room = rooms.get(roomId);
            if (room && room.users.size < 12) {
                socket.join(roomId);
                room.users.set(socket.id, username);
                room.usersMoves.set(socket.id, []);
                io.to(socket.id).emit("joined", roomId);
            }
            else
                io.to(socket.id).emit("joined", "", true);
        });
        socket.on("joined_room", () => {
            const roomId = getRoomId();
            const room = rooms.get(roomId);
            if (!room)
                return;
            io.to(socket.id).emit("room", room, JSON.stringify([...room.usersMoves]), JSON.stringify([...room.users]));
            socket.broadcast
                .to(roomId)
                .emit("new_user", socket.id, room.users.get(socket.id) || "Anonymous");
        });
        socket.on("leave_room", () => {
            const roomId = getRoomId();
            leaveRoom(roomId, socket.id);
            io.to(roomId).emit("user_disconnected", socket.id);
        });
        socket.on("draw", (move) => {
            const roomId = getRoomId();
            const timestamp = Date.now();
            // eslint-disable-next-line no-param-reassign
            move.id = (0, uuid_1.v4)();
            addMove(roomId, socket.id, Object.assign(Object.assign({}, move), { timestamp }));
            io.to(socket.id).emit("your_move", Object.assign(Object.assign({}, move), { timestamp }));
            socket.broadcast
                .to(roomId)
                .emit("user_draw", Object.assign(Object.assign({}, move), { timestamp }), socket.id);
        });
        socket.on("undo", () => {
            const roomId = getRoomId();
            undoMove(roomId, socket.id);
            socket.broadcast.to(roomId).emit("user_undo", socket.id);
        });
        socket.on("mouse_move", (x, y) => {
            socket.broadcast.to(getRoomId()).emit("mouse_moved", x, y, socket.id);
        });
        socket.on("send_msg", (msg) => {
            io.to(getRoomId()).emit("new_msg", socket.id, msg);
        });
        socket.on("disconnecting", () => {
            const roomId = getRoomId();
            leaveRoom(roomId, socket.id);
            io.to(roomId).emit("user_disconnected", socket.id);
        });
    });
    app.all("*", (req, res) => nextHandler(req, res));
    server.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`> Ready on http://localhost:${port}`);
    });
});
