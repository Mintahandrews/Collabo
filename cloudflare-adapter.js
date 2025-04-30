// Cloudflare Worker compatibility adapter
// This file helps bridge between Socket.IO and the Cloudflare WebSocket API

import { cloudflareSocket } from "./common/lib/cloudflare-socket";

// Function to initialize connection to a room
export async function connectToRoom(roomId, username) {
  // First check if the room exists
  await new Promise((resolve) => {
    cloudflareSocket.on("room_exists", (data) => {
      if (data.exists) {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    cloudflareSocket.emit("check_room", roomId);
  });

  // Then join or create the room
  if (roomId) {
    cloudflareSocket.emit("join_room", { roomId, username });
  } else {
    // Create a new room
    return new Promise((resolve) => {
      cloudflareSocket.on("created", (data) => {
        resolve(data.roomId);
      });

      cloudflareSocket.emit("create_room", username);
    });
  }
}

// If we need to redirect to a room-specific WebSocket
cloudflareSocket.on("redirect_to_room", async (data) => {
  const { roomId, endpoint } = data;

  // Create a new WebSocket connection directly to the room
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const url = `${protocol}//${host}${endpoint}`;

  // Create a new WebSocket connection
  const socket = new WebSocket(url);

  // Set up event listeners
  socket.addEventListener("open", () => {
    console.log("Connected to room WebSocket");
  });

  socket.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data);
      // Handle the message based on the event type
      // This would need to match your application's expected events
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  });

  socket.addEventListener("close", () => {
    console.log("Room WebSocket connection closed");
  });

  socket.addEventListener("error", (error) => {
    console.error("Room WebSocket error:", error);
  });
});
