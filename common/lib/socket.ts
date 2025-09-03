import { Socket } from "socket.io-client";
import io from "socket.io-client";

// Get the server URL from environment variable or default to localhost in development
const getServerUrl = () => {
  if (typeof window !== "undefined") {
    // Browser environment
    // For Render deployments, use the same origin for WebSocket connections
    // This ensures we connect to the correct WebSocket endpoint on Render
    const protocol = window.location.protocol;
    const host = window.location.host;
    return `${protocol}//${host}`;
  }
  
  // For server-side rendering, use the environment variable
  // In Render, this would be the service URL
  return process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3000";
};

// Configure transports with optional force-polling to stabilize on some proxies (e.g., Render)
const forcePolling =
  process.env.NEXT_PUBLIC_FORCE_POLLING === "true" ||
  process.env.NEXT_PUBLIC_FORCE_POLLING === "1";
const clientTransports = forcePolling ? ["polling"] : ["polling", "websocket"];

// Enhanced socket configuration for Render compatibility
export const socket: AppSocket = io(getServerUrl(), {
  reconnection: true,
  reconnectionAttempts: Infinity, // Keep trying to reconnect indefinitely
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5, // Add randomization to reconnection attempts
  timeout: 30000, // Increase timeout for high-latency connections
  
  // Prefer polling first, then upgrade to websocket when possible
  transports: clientTransports,
  
  forceNew: true,
  autoConnect: true,
  path: "/socket.io",
  upgrade: !forcePolling, // Disable upgrades when forcing polling
  rememberUpgrade: false, // Avoid sticky websocket preference across sessions
  rejectUnauthorized: false, // For mixed content issues with self-signed certs
  
  // Additional configuration for Render
  auth: {
    clientInfo: "Collabo WebSocket Client"
  },
  // Socket.IO manages keep-alive internally
  // We'll rely on the default behavior for connection maintenance
});

// Add connection status monitoring
socket.on("connect", () => {
  console.log("Socket connected successfully");
});

socket.on("disconnect", (reason: string) => {
  console.log(`Socket disconnected: ${reason}`);
  // Automatically try to reconnect on disconnect with increasing backoff
  if (
    reason === "transport close" ||
    reason === "ping timeout" ||
    reason === "transport error"
  ) {
    console.log("Attempting to reconnect...");
    // If we're having connection issues, try to force polling
    if (!socket.connected) {
      console.log("Trying connection with polling transport only");
      // Reset the socket's transport to only use polling
      socket.io.opts.transports = ["polling"];
    }
    
    setTimeout(() => {
      if (!socket.connected) {
        socket.connect();
      }
    }, 1500);
  }
});

socket.on("connect_error", (error: Error) => {
  console.error("Socket connection error:", error);
  
  // Check if this might be a network change error
  if (error.message?.includes("websocket") || error.message?.includes("xhr")) {
    console.log("Possible network change detected, trying polling transport");
    socket.io.opts.transports = ["polling"]; // Force polling on network issues
  }
  
  // Try to reconnect on error with a progressive backoff
  const backoff = Math.min(socket.io.backoff.attempts * 1000, 5000);
  setTimeout(() => {
    console.log(`Attempting to reconnect after error... (attempt ${socket.io.backoff.attempts})`); 
    if (!socket.connected) {
      socket.connect();
    }
  }, backoff);
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
