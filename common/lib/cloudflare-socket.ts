import { EventEmitter } from "events";

// Simple socket interface for Cloudflare Workers
export class CloudflareSocket extends EventEmitter {
  private connected = false;
  private connectionUrl: string;
  private socket: WebSocket | null = null;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private reconnectionAttempts = 0;
  private maxReconnectionAttempts = 5;

  constructor(url?: string) {
    super();
    this.connectionUrl = url || this.getServerUrl();
  }

  // Get the server URL from environment variable or default to the current host
  private getServerUrl(): string {
    if (typeof window !== "undefined") {
      // Browser environment
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      return `${protocol}//${host}/api/socket`;
    }
    return (
      process.env.NEXT_PUBLIC_WEBSOCKET_URL || "wss://localhost:8787/api/socket"
    );
  }

  // Connect to the WebSocket server
  connect(): void {
    if (this.socket) {
      this.socket.close();
    }

    try {
      this.socket = new WebSocket(this.connectionUrl);

      this.socket.onopen = () => {
        this.connected = true;
        this.reconnectionAttempts = 0;
        this.emit("connect");

        if (this.reconnectInterval) {
          clearInterval(this.reconnectInterval);
          this.reconnectInterval = null;
        }
      };

      this.socket.onclose = () => {
        this.connected = false;
        this.emit("disconnect", "transport close");
        this.attemptReconnect();
      };

      this.socket.onerror = (error) => {
        this.emit("connect_error", error);
        if (this.socket) {
          this.socket.close();
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const { event: eventName, ...payload } = data;
          this.emit(eventName, payload);
        } catch (error) {
          console.error("Error parsing message:", error);
        }
      };
    } catch (error) {
      this.emit("connect_error", error);
      this.attemptReconnect();
    }
  }

  // Send an event to the server
  emit(event: string, ...args: any[]): boolean {
    if (
      event === "connect" ||
      event === "disconnect" ||
      event === "connect_error" ||
      event === "reconnect"
    ) {
      return super.emit(event, ...args);
    }

    if (!this.connected || !this.socket) {
      return false;
    }

    try {
      this.socket.send(
        JSON.stringify({
          event,
          data: args.length > 0 ? args[0] : null,
        })
      );
      return true;
    } catch (error) {
      console.error("Error sending message:", error);
      return false;
    }
  }

  // Attempt to reconnect
  private attemptReconnect(): void {
    if (this.reconnectInterval) {
      return;
    }

    this.reconnectInterval = setInterval(() => {
      if (this.reconnectionAttempts >= this.maxReconnectionAttempts) {
        this.emit("reconnect_failed");
        if (this.reconnectInterval) {
          clearInterval(this.reconnectInterval);
          this.reconnectInterval = null;
        }
        return;
      }

      this.reconnectionAttempts++;
      this.emit("reconnect_attempt", this.reconnectionAttempts);
      this.connect();
    }, 1000);
  }

  // Disconnect from the server
  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    this.connected = false;
  }

  // Add event listener
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  // Check if connected
  isConnected(): boolean {
    return this.connected;
  }
}

// Create and export the socket instance
export const cloudflareSocket = new CloudflareSocket();

// Auto-connect when imported
if (typeof window !== "undefined") {
  setTimeout(() => {
    cloudflareSocket.connect();
  }, 0);
}
