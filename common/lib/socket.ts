import { Socket } from "socket.io-client";
import io from "socket.io-client";

// Get the server URL from environment variable or default to localhost in development
const getServerUrl = () => {
  if (typeof window !== "undefined") {
    // Browser environment
    const protocol = window.location.protocol;
    const host = window.location.host;
    return `${protocol}//${host}`;
  }
  return process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3000";
};

// Configure socket with reconnection options for better reliability
export const socket: AppSocket = io(getServerUrl(), {
  reconnection: true,
  reconnectionAttempts: Infinity, // Keep trying to reconnect indefinitely
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  transports: ["websocket", "polling"],
  forceNew: true,
  autoConnect: true,
  path: "/socket.io",
});

// Add connection status monitoring
socket.on("connect", () => {
  console.log("Socket connected successfully");
});

socket.on("disconnect", (reason: string) => {
  console.log(`Socket disconnected: ${reason}`);
  // Automatically try to reconnect on disconnect
  if (reason === "transport close" || reason === "ping timeout") {
    console.log("Attempting to reconnect...");
    setTimeout(() => {
      socket.connect();
    }, 1000);
  }
});

socket.on("connect_error", (error: Error) => {
  console.error("Socket connection error:", error);
  // Try to reconnect on error after a delay
  setTimeout(() => {
    console.log("Attempting to reconnect after error...");
    socket.connect();
  }, 1000);
});

socket.on("reconnect", (attempt: number) => {
  console.log(`Socket reconnected after ${attempt} attempts`);
});

socket.on("reconnect_error", (error: Error) => {
  console.error("Socket reconnect error:", error);
});

socket.on("reconnect_failed", () => {
  console.error("Socket reconnection failed after all attempts");
  // Try to reconnect even after all attempts fail
  setTimeout(() => {
    console.log("Attempting to reconnect after failure...");
    socket.connect();
  }, 2000);
});
