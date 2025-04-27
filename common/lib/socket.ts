import { Socket } from "socket.io-client";
import io from "socket.io-client";

// Configure socket with reconnection options for better reliability
export const socket: AppSocket = io({
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

// Add connection status monitoring
socket.on("connect", () => {
  console.log("Socket connected successfully");
});

socket.on("disconnect", (reason: string) => {
  console.log(`Socket disconnected: ${reason}`);
});

socket.on("reconnect", (attempt: number) => {
  console.log(`Socket reconnected after ${attempt} attempts`);
});

socket.on("reconnect_error", (error: Error) => {
  console.error("Socket reconnect error:", error);
});

socket.on("reconnect_failed", () => {
  console.error("Socket reconnection failed after all attempts");
});
