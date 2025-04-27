import { Server } from "socket.io";

const socketServer = (io: Server) => {
  io.on("connection", (socket) => {
    socket.on("join_room", async (roomId: string, callback) => {
      await socket.join(roomId);
      socket.data.roomId = roomId;

      // Send to the client their socket id
      callback({
        success: true,
        socketId: socket.id,
      });

      // Tell everyone else that a new user has joined the room
      socket.to(roomId).emit("user_joined", socket.id);
    });

    socket.on("delete_all_shapes", () => {
      const { roomId } = socket.data;
      if (!roomId) return;

      socket.to(roomId).emit("clean_canvas");
    });

    socket.on("draw", (move) => {
      const { roomId } = socket.data;
      if (!roomId) return;

      socket.to(roomId).emit("update_canvas", move, socket.id);
    });

    socket.on("mouse_move", (e) => {
      const { roomId } = socket.data;
      if (!roomId) return;

      socket.to(roomId).emit("update_mouse", e, socket.id);
    });

    socket.on("send_msg", (msg) => {
      const { roomId } = socket.data;
      if (!roomId) return;

      socket.to(roomId).emit("receive_msg", msg, socket.id);
    });

    socket.on("webrtc_offer", (offer, toId) => {
      socket.to(toId).emit("webrtc_offer", offer, socket.id);
    });

    socket.on("webrtc_answer", (answer, toId) => {
      socket.to(toId).emit("webrtc_answer", answer, socket.id);
    });

    socket.on("webrtc_ice_candidate", (candidate, toId) => {
      socket.to(toId).emit("webrtc_ice_candidate", candidate, socket.id);
    });

    // Handle WebRTC reconnection requests
    socket.on("webrtc_reconnect_request", (toId) => {
      console.log(`${socket.id} requested WebRTC reconnect with ${toId}`);
      socket.to(toId).emit("webrtc_reconnect_request", socket.id);
    });

    socket.on("joined_room", () => {
      const { roomId } = socket.data;
      if (!roomId) return;

      socket.to(roomId).emit("user_joined_room", socket.id);
    });

    socket.on("disconnecting", () => {
      const { roomId } = socket.data;
      if (!roomId) return;

      socket.to(roomId).emit("user_disconnected", socket.id);
    });
  });
};

export default socketServer;
