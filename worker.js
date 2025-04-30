// RoomState Durable Object for storing collaborative state
export class RoomState {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.storage = state.storage;
    this.sessions = new Map();
    this.roomData = null;
  }

  async initialize() {
    const storedData = await this.storage.get("roomData");
    this.roomData = storedData || {
      usersMoves: new Map(),
      drawn: [],
      users: new Map(),
    };
  }

  // Handle websocket connections
  async webSocketHandler(webSocket, userId) {
    // Store the websocket connection
    this.sessions.set(userId, webSocket);

    webSocket.accept();

    webSocket.addEventListener("message", async (event) => {
      try {
        const { event: eventName, data } = JSON.parse(event.data);

        switch (eventName) {
          case "join_room":
            await this.handleJoinRoom(webSocket, userId, data);
            break;
          case "draw":
            await this.handleDraw(webSocket, userId, data);
            break;
          case "undo":
            await this.handleUndo(webSocket, userId);
            break;
          case "mouse_move":
            this.handleMouseMove(webSocket, userId, data);
            break;
          case "send_msg":
            this.handleSendMessage(webSocket, userId, data);
            break;
          case "leave_room":
            await this.handleLeaveRoom(webSocket, userId);
            break;
          default:
            console.error(`Unknown event: ${eventName}`);
        }
      } catch (error) {
        console.error("Error handling message:", error);
      }
    });

    webSocket.addEventListener("close", async () => {
      await this.handleDisconnect(userId);
    });

    webSocket.addEventListener("error", async () => {
      await this.handleDisconnect(userId);
    });
  }

  // Handle user joining a room
  async handleJoinRoom(webSocket, userId, data) {
    await this.initialize();

    const { username } = data;

    if (this.roomData.users.size < 12) {
      this.roomData.users.set(userId, username);
      if (!this.roomData.usersMoves.has(userId)) {
        this.roomData.usersMoves.set(userId, []);
      }

      // Save room state
      await this.storage.put("roomData", this.roomData);

      // Send room data to the new user
      this.sendToClient(webSocket, "room", {
        room: this.roomData,
        usersMovesToParse: JSON.stringify(
          Array.from(this.roomData.usersMoves.entries())
        ),
        usersToParse: JSON.stringify(Array.from(this.roomData.users.entries())),
      });

      // Notify other users in the room
      this.broadcastToRoom(
        "new_user",
        {
          userId: userId,
          username: username,
        },
        userId
      );

      // Send success to the client
      this.sendToClient(webSocket, "joined", { success: true });
    } else {
      this.sendToClient(webSocket, "joined", {
        success: false,
        error: "Room is full",
      });
    }
  }

  // Handle drawing
  async handleDraw(webSocket, userId, moveData) {
    await this.initialize();

    const move = {
      ...moveData,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    // Get user's moves or create empty array
    const userMoves = this.roomData.usersMoves.get(userId) || [];
    userMoves.push(move);
    this.roomData.usersMoves.set(userId, userMoves);

    // Save room state
    await this.storage.put("roomData", this.roomData);

    // Send move back to the sender
    this.sendToClient(webSocket, "your_move", move);

    // Broadcast to others
    this.broadcastToRoom(
      "user_draw",
      {
        move: move,
        userId: userId,
      },
      userId
    );
  }

  // Handle undoing a move
  async handleUndo(webSocket, userId) {
    await this.initialize();

    const userMoves = this.roomData.usersMoves.get(userId);
    if (userMoves && userMoves.length > 0) {
      userMoves.pop();
      this.roomData.usersMoves.set(userId, userMoves);

      // Save room state
      await this.storage.put("roomData", this.roomData);

      // Broadcast to all users
      this.broadcastToRoom("user_undo", { userId });
    }
  }

  // Handle mouse movement
  handleMouseMove(webSocket, userId, data) {
    const { x, y } = data;

    // Broadcast to all except sender
    this.broadcastToRoom(
      "mouse_moved",
      {
        x,
        y,
        userId,
      },
      userId
    );
  }

  // Handle sending a message
  handleSendMessage(webSocket, userId, msg) {
    // Broadcast to all users
    this.broadcastToRoom("new_msg", {
      userId,
      msg,
    });
  }

  // Handle user leaving a room
  async handleLeaveRoom(webSocket, userId) {
    await this.handleDisconnect(userId);
  }

  // Handle user disconnection
  async handleDisconnect(userId) {
    await this.initialize();

    // Remove user from sessions
    this.sessions.delete(userId);

    // If the user was in the room, clean up
    if (this.roomData.users.has(userId)) {
      // Move user's drawings to the 'drawn' collection
      const userMoves = this.roomData.usersMoves.get(userId) || [];
      this.roomData.drawn.push(...userMoves);

      // Remove user data
      this.roomData.users.delete(userId);
      this.roomData.usersMoves.delete(userId);

      // Save room state
      await this.storage.put("roomData", this.roomData);

      // Notify other users
      this.broadcastToRoom("user_disconnected", { userId });
    }
  }

  // Send message to a specific client
  sendToClient(webSocket, event, data) {
    try {
      webSocket.send(
        JSON.stringify({
          event,
          ...data,
        })
      );
    } catch (error) {
      console.error("Error sending to client:", error);
    }
  }

  // Broadcast message to all clients except specified one
  broadcastToRoom(event, data, excludeUserId = null) {
    for (const [userId, webSocket] of this.sessions.entries()) {
      if (userId !== excludeUserId) {
        this.sendToClient(webSocket, event, data);
      }
    }
  }

  // Generate a random ID
  generateId() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Handle HTTP requests
  async fetch(request) {
    const url = new URL(request.url);

    // Return room status
    return new Response(
      JSON.stringify({
        users: this.roomData ? this.roomData.users.size : 0,
        status: "active",
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

// Main worker entry point
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle WebSocket connections for rooms
    if (path.startsWith("/api/room/")) {
      const roomId = path.slice("/api/room/".length);
      if (!roomId) {
        return new Response("Room ID is required", { status: 400 });
      }

      // Get or create the Room Durable Object
      const roomObject = env.ROOMS.get(env.ROOMS.idFromName(roomId));

      if (request.headers.get("Upgrade") === "websocket") {
        // Create a WebSocket pair
        const pair = new WebSocketPair();
        const [client, server] = [pair[0], pair[1]];

        // Generate a unique user ID
        const userId = crypto.randomUUID();

        // Handle WebSocket in the Durable Object
        roomObject.webSocketHandler(server, userId);

        // Return the client end of the WebSocket
        return new Response(null, {
          status: 101,
          webSocket: client,
        });
      } else {
        // Handle HTTP request to check room status
        return roomObject.fetch(request);
      }
    }

    // Handle WebSocket connections for the main socket endpoint
    if (path === "/api/socket") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected websocket", { status: 400 });
      }

      // Create a WebSocket pair
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];

      // Accept the WebSocket connection
      server.accept();

      // Set up WebSocket handlers
      const sessionId = crypto.randomUUID();
      setupWebSocketHandlers(server, sessionId, env);

      // Return the client end of the WebSocket
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // Serve static assets for all other routes
    return env.ASSETS.fetch(request);
  },
};

// Main WebSocket handler for the default endpoint
function setupWebSocketHandlers(webSocket, sessionId, env) {
  // Room management
  let currentRoomId = null;

  webSocket.addEventListener("message", async (event) => {
    try {
      const message = JSON.parse(event.data);
      const { event: eventName, data } = message;

      // Handle different event types
      switch (eventName) {
        case "create_room":
          await handleCreateRoom(webSocket, sessionId, data, env);
          break;
        case "check_room":
          await handleCheckRoom(webSocket, data, env);
          break;
        case "join_room":
          await handleJoinRoom(webSocket, sessionId, data, env);
          currentRoomId = data.roomId;
          break;
        default:
          console.error(`Unknown event: ${eventName}`);
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  });

  webSocket.addEventListener("close", () => {
    // Clean up when the connection is closed
    if (currentRoomId) {
      handleLeaveRoom(sessionId, currentRoomId, env);
    }
  });
}

// Handle creating a new room
async function handleCreateRoom(webSocket, sessionId, username, env) {
  // Generate a unique room ID
  const roomId = crypto.randomUUID().substring(0, 4);

  // Create a new Room Durable Object
  const roomObject = env.ROOMS.get(env.ROOMS.idFromName(roomId));

  // Send the room ID back to the client
  sendToClient(webSocket, "created", { roomId });
}

// Check if a room exists
async function handleCheckRoom(webSocket, roomId, env) {
  try {
    // Try to access the Room Durable Object
    const roomObject = env.ROOMS.get(env.ROOMS.idFromName(roomId));
    const response = await roomObject.fetch("http://internal/status");
    const status = await response.json();

    // Send the result back to the client
    sendToClient(webSocket, "room_exists", { exists: status.users > 0 });
  } catch (error) {
    sendToClient(webSocket, "room_exists", { exists: false });
  }
}

// Handle joining a room
async function handleJoinRoom(webSocket, sessionId, data, env) {
  // Extract room ID and username
  const { roomId, username } = data;

  // Will be handled by connecting directly to the room
  sendToClient(webSocket, "redirect_to_room", {
    roomId,
    endpoint: `/api/room/${roomId}`,
  });
}

// Handle a user leaving a room
async function handleLeaveRoom(sessionId, roomId, env) {
  // This is handled by the Room Durable Object when the WebSocket closes
}

// Send a message to a client
function sendToClient(webSocket, event, data) {
  try {
    webSocket.send(
      JSON.stringify({
        event,
        ...data,
      })
    );
  } catch (error) {
    console.error("Error sending to client:", error);
  }
}
