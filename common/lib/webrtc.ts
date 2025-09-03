import { Socket } from "socket.io-client";

interface PeerConnection {
  connection: RTCPeerConnection;
  stream: MediaStream;
  pendingIceCandidates?: RTCIceCandidateInit[];
  connectionTimeout?: NodeJS.Timeout;
}

interface MediaConstraints {
  video: boolean | MediaTrackConstraints;
  audio: boolean | MediaTrackConstraints;
}

class WebRTCService {
  private peerConnections: Map<string, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private socket: AppSocket;
  private connectionConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      { urls: "stun:stun.stunprotocol.org:3478" },
      { urls: "stun:stun.voip.blackberry.com:3478" },
    ],
    iceCandidatePoolSize: 10,
  };
  
  // Dynamically fetched TURN servers (ephemeral)
  private dynamicIceServers: RTCIceServer[] | null = null;
  private iceServersExpiryAt: number | null = null; // epoch ms
  private iceFetchPromise: Promise<void> | null = null;
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectAttempts = 5;
  private connectionTimeoutDuration = 45000;
  private iceGatheringTimeoutDuration = 20000;

  constructor(socket: AppSocket) {
    this.socket = socket;
    this.setupSocketListeners();
  }

  private setupSocketListeners() {
    this.socket.on(
      "webrtc_offer",
      async (offer: RTCSessionDescriptionInit, fromId: string) => {
        try {
          console.log(`Received WebRTC offer from ${fromId}`);
          const peerConnection = await this.createPeerConnection(fromId);
          await peerConnection.connection.setRemoteDescription(
            new RTCSessionDescription(offer)
          );
          const answer = await peerConnection.connection.createAnswer();
          await peerConnection.connection.setLocalDescription(answer);
          this.socket.emit("webrtc_answer", answer, fromId);

          // After setting remote description, add any pending ICE candidates
          this.addPendingIceCandidates(fromId);

          // Set a connection timeout
          this.setConnectionTimeout(fromId);
        } catch (err) {
          console.error("Error handling WebRTC offer:", err);
          this.emitConnectionError(fromId, "offer-error");
        }
      }
    );

    this.socket.on(
      "webrtc_answer",
      async (answer: RTCSessionDescriptionInit, fromId: string) => {
        try {
          console.log(`Received WebRTC answer from ${fromId}`);
          const peerConnection = this.peerConnections.get(fromId);
          if (peerConnection) {
            await peerConnection.connection.setRemoteDescription(
              new RTCSessionDescription(answer)
            );

            // After setting remote description, add any pending ICE candidates
            this.addPendingIceCandidates(fromId);
          } else {
            console.warn(`No peer connection found for user ${fromId}`);
          }
        } catch (err) {
          console.error("Error handling WebRTC answer:", err);
          this.emitConnectionError(fromId, "answer-error");
        }
      }
    );

    this.socket.on(
      "webrtc_ice_candidate",
      async (candidate: RTCIceCandidateInit, fromId: string) => {
        try {
          console.log(`Received ICE candidate from ${fromId}`, candidate);
          const peerConnection = this.peerConnections.get(fromId);
          if (peerConnection && peerConnection.connection.remoteDescription) {
            await peerConnection.connection.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          } else if (peerConnection) {
            // Store the ICE candidate to apply later when remote description is set
            if (!peerConnection.pendingIceCandidates) {
              peerConnection.pendingIceCandidates = [];
            }
            peerConnection.pendingIceCandidates.push(candidate);
          } else {
            console.warn(
              `No peer connection found for ${fromId} to add ICE candidate`
            );
          }
        } catch (err) {
          console.error("Error handling ICE candidate:", err);
        }
      }
    );

    this.socket.on("user_disconnected", (userId: string) => {
      console.log(`User disconnected: ${userId}`);
      this.removePeerConnection(userId);
    });

    // Listen for reconnect requests
    this.socket.on("webrtc_reconnect_request", (fromId: string) => {
      console.log(`Reconnect request from ${fromId}`);
      this.handleReconnectRequest(fromId);
    });

    // Add socket connection status monitoring
    this.socket.on("connect", () => {
      console.log("Socket connected - WebRTC signaling available");
      // Re-establish any active calls that may have been interrupted
      this.peerConnections.forEach((_, userId) => {
        this.restartIceForPeer(userId);
      });
    });

    this.socket.on("disconnect", () => {
      console.log("Socket disconnected - WebRTC signaling unavailable");
      // Emit an event so UI can show connection warning
      window.dispatchEvent(
        new CustomEvent("webrtc-signaling-disconnected", {
          detail: { message: "Signaling server disconnected. Reconnecting..." },
        })
      );
    });
  }

  private setConnectionTimeout(userId: string) {
    const peerConnection = this.peerConnections.get(userId);
    if (peerConnection) {
      // Clear any existing timeout
      if (peerConnection.connectionTimeout) {
        clearTimeout(peerConnection.connectionTimeout);
      }

      // Get current reconnect attempt count for progressive timeout
      const attempts = this.reconnectAttempts.get(userId) || 0;
      // Use exponential backoff for timeout (base: 15s, max: 45s)
      const timeoutDuration = Math.min(
        15000 * Math.pow(1.5, attempts),
        this.connectionTimeoutDuration
      );

      console.log(
        `Setting connection timeout for ${userId} of ${timeoutDuration}ms (attempt ${
          attempts + 1
        })`
      );

      // Set new timeout
      peerConnection.connectionTimeout = setTimeout(() => {
        const currentPeer = this.peerConnections.get(userId);
        if (
          currentPeer &&
          currentPeer.connection.iceConnectionState !== "connected" &&
          currentPeer.connection.iceConnectionState !== "completed"
        ) {
          console.warn(`Connection timeout for peer ${userId}`);

          // Dispatch a custom event for the UI to show a timeout message
          window.dispatchEvent(
            new CustomEvent("peer-connection-timeout", {
              detail: {
                userId,
                message: "Call connection timed out. Please try again.",
              },
            })
          );

          this.attemptReconnect(userId);
        }
      }, timeoutDuration);
    }
  }

  private clearConnectionTimeout(userId: string) {
    const peerConnection = this.peerConnections.get(userId);
    if (peerConnection && peerConnection.connectionTimeout) {
      clearTimeout(peerConnection.connectionTimeout);
      peerConnection.connectionTimeout = undefined;
    }
  }

  private emitConnectionError(userId: string, errorType: string) {
    window.dispatchEvent(
      new CustomEvent("webrtc-connection-error", {
        detail: { userId, errorType },
      })
    );
  }

  private attemptReconnect(userId: string) {
    const attempts = this.reconnectAttempts.get(userId) || 0;

    if (attempts < this.maxReconnectAttempts) {
      const nextAttempt = attempts + 1;
      console.log(
        `Attempting to reconnect to ${userId}, attempt ${nextAttempt}/${this.maxReconnectAttempts}`
      );
      this.reconnectAttempts.set(userId, nextAttempt);

      // Add progressive delay before reconnecting to avoid rapid reconnection attempts
      // which can sometimes make the problem worse
      const reconnectDelay = Math.min(1000 * Math.pow(1.5, attempts), 8000);

      console.log(
        `Waiting ${reconnectDelay}ms before reconnect attempt ${nextAttempt}`
      );

      setTimeout(() => {
        // Check if the connection has been restored during the delay
        const peerConnection = this.peerConnections.get(userId);
        if (
          peerConnection &&
          (peerConnection.connection.iceConnectionState === "connected" ||
            peerConnection.connection.iceConnectionState === "completed")
        ) {
          console.log(
            `Connection restored during reconnect delay. Cancelling reconnect.`
          );
          return;
        }

        // Signal the other peer that we want to reconnect
        this.socket.emit("webrtc_reconnect_request", userId);

        // Restart the connection from our side
        this.restartIceForPeer(userId);
      }, reconnectDelay);
    } else {
      console.error(
        `Failed to connect to ${userId} after ${attempts} attempts`
      );
      this.reconnectAttempts.delete(userId);

      // Notify UI about permanent failure
      window.dispatchEvent(
        new CustomEvent("peer-connection-failed", {
          detail: {
            userId,
            message:
              "Connection failed after multiple attempts. Please try again later.",
          },
        })
      );

      // Clean up the failed connection
      this.removePeerConnection(userId);
    }
  }

  private handleReconnectRequest(userId: string) {
    const peerConnection = this.peerConnections.get(userId);

    if (peerConnection) {
      console.log(`Handling reconnect request from ${userId}`);
      this.restartIceForPeer(userId);
    } else {
      // Peer connection doesn't exist, create a new one
      this.initiateCall(userId);
    }
  }

  private async addPendingIceCandidates(userId: string) {
    const peerConnection = this.peerConnections.get(userId);
    if (
      peerConnection &&
      peerConnection.pendingIceCandidates &&
      peerConnection.pendingIceCandidates.length > 0
    ) {
      console.log(
        `Adding ${peerConnection.pendingIceCandidates.length} pending ICE candidates for ${userId}`
      );
      for (const candidate of peerConnection.pendingIceCandidates) {
        try {
          await peerConnection.connection.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        } catch (err) {
          console.error("Error adding pending ICE candidate:", err);
        }
      }
      // Clear the pending candidates after adding them
      peerConnection.pendingIceCandidates = [];
    }
  }

  private async createPeerConnection(userId: string): Promise<PeerConnection> {
    // Close existing connection if any
    this.removePeerConnection(userId);

    console.log(`Creating new peer connection for ${userId}`);
    await this.ensureIceServers();
    const effectiveConfig: RTCConfiguration = {
      iceServers: this.getEffectiveIceServers(),
      iceCandidatePoolSize: this.connectionConfig.iceCandidatePoolSize,
    };
    const connection = new RTCPeerConnection(effectiveConfig);
    let stream: MediaStream;

    try {
      stream = await this.getLocalStream();
      stream.getTracks().forEach((track) => {
        connection.addTrack(track, stream);
      });
    } catch (err) {
      console.error("Failed to get local stream:", err);
      throw err;
    }

    // Reset reconnect attempts when creating a new connection
    this.reconnectAttempts.set(userId, 0);

    // Set up ICE gathering timeout to prevent long delays
    let iceGatheringTimeout: NodeJS.Timeout | null = setTimeout(() => {
      if (connection.iceGatheringState !== "complete") {
        console.log(
          `ICE gathering taking too long for ${userId}, proceeding anyway`
        );
        // Force the gathering to "complete" by setting null candidate
        // This only works if we've gathered at least one candidate
        connection.onicegatheringstatechange = null;
        if (connection.localDescription) {
          const completedEvent = new Event("icegatheringstatechange");
          connection.dispatchEvent(completedEvent);
        }
      }
    }, this.iceGatheringTimeoutDuration);

    connection.onicegatheringstatechange = () => {
      console.log(
        `ICE gathering state changed to: ${connection.iceGatheringState} for ${userId}`
      );
      if (connection.iceGatheringState === "complete" && iceGatheringTimeout) {
        clearTimeout(iceGatheringTimeout);
        iceGatheringTimeout = null;
      }
    };

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`Sending ICE candidate to ${userId}`, event.candidate);
        this.socket.emit("webrtc_ice_candidate", event.candidate, userId);
      } else {
        console.log(`ICE candidate gathering completed for ${userId}`);
      }
    };

    connection.oniceconnectionstatechange = () => {
      // Handle ICE connection state changes
      console.log(
        `ICE connection state change: ${connection.iceConnectionState} for user ${userId}`
      );

      // Dispatch a custom event for the UI to react to connection state changes
      window.dispatchEvent(
        new CustomEvent("ice-connection-state-change", {
          detail: {
            userId,
            state: connection.iceConnectionState,
          },
        })
      );

      if (
        connection.iceConnectionState === "connected" ||
        connection.iceConnectionState === "completed"
      ) {
        // Clear reconnect attempts on successful connection
        this.reconnectAttempts.set(userId, 0);
        this.clearConnectionTimeout(userId);
      } else if (
        connection.iceConnectionState === "failed" ||
        connection.iceConnectionState === "disconnected"
      ) {
        // Try to restart ICE if connection fails
        console.warn(
          `Connection ${connection.iceConnectionState} for ${userId}, attempting ICE restart`
        );
        this.attemptReconnect(userId);
      }
    };

    connection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      console.log(`Received track from ${userId}`, event.track.kind);
      const peerConnection = this.peerConnections.get(userId);
      if (peerConnection) {
        peerConnection.stream = remoteStream;
      }

      // Dispatch event for remote stream
      window.dispatchEvent(
        new CustomEvent("remote-stream-updated", {
          detail: { userId, stream: remoteStream },
        })
      );
    };

    // Monitor connection state as well
    connection.onconnectionstatechange = () => {
      console.log(
        `Connection state change: ${connection.connectionState} for user ${userId}`
      );

      // If the connection is closed or failed, attempt cleanup
      if (connection.connectionState === "connected") {
        // Clear reconnect attempts on successful connection
        this.reconnectAttempts.set(userId, 0);
        this.clearConnectionTimeout(userId);
      } else if (
        connection.connectionState === "closed" ||
        connection.connectionState === "failed"
      ) {
        // Dispatch a custom event for connection failure
        window.dispatchEvent(
          new CustomEvent("peer-connection-failed", {
            detail: { userId },
          })
        );

        if (connection.connectionState === "failed") {
          this.attemptReconnect(userId);
        }
      }
    };

    const peerConnection = { connection, stream };
    this.peerConnections.set(userId, peerConnection);

    // Start monitoring connection stats
    this.monitorConnectionStats(userId);

    return peerConnection;
  }

  private async restartIceForPeer(userId: string) {
    const peerConnection = this.peerConnections.get(userId);
    if (peerConnection) {
      try {
        console.log(`Restarting ICE for ${userId}`);
        await this.ensureIceServers();
        const effectiveServers = this.getEffectiveIceServers();
        try {
          peerConnection.connection.setConfiguration({ iceServers: effectiveServers });
          console.log(`Updated ICE servers before restart (count=${effectiveServers.length})`);
        } catch (cfgErr) {
          console.warn("Failed to update ICE servers via setConfiguration", cfgErr);
        }
        // Create new offer with ICE restart flag
        const offer = await peerConnection.connection.createOffer({
          iceRestart: true,
        });
        await peerConnection.connection.setLocalDescription(offer);
        this.socket.emit("webrtc_offer", offer, userId);

        // Set a new connection timeout
        this.setConnectionTimeout(userId);
      } catch (err) {
        console.error("Error restarting ICE:", err);
        this.emitConnectionError(userId, "ice-restart-error");
      }
    } else {
      console.warn(
        `Cannot restart ICE: No peer connection found for ${userId}`
      );
    }
  }
 
  // --- Ephemeral TURN support ---
  private async ensureIceServers(): Promise<void> {
    const now = Date.now();
    if (
      this.dynamicIceServers &&
      this.iceServersExpiryAt &&
      now < this.iceServersExpiryAt - 60_000 // refresh 60s early
    ) {
      return;
    }

    if (this.iceFetchPromise) {
      try {
        await this.iceFetchPromise;
      } catch (_) {
        // ignore; fall back to STUN-only
      }
      return;
    }

    this.iceFetchPromise = this.fetchEphemeralIceServers();
    try {
      await this.iceFetchPromise;
    } finally {
      this.iceFetchPromise = null;
    }
  }

  private getEffectiveIceServers(): RTCIceServer[] {
    return [
      ...this.connectionConfig.iceServers,
      ...(this.dynamicIceServers || []),
    ];
  }

  private async fetchEphemeralIceServers(): Promise<void> {
    try {
      const res = await fetch("/api/turn-credentials", { method: "GET" });
      if (!res.ok) {
        console.warn("Failed to fetch TURN credentials:", res.status);
        return;
      }
      const data: any = await res.json();
      const iceServersRaw = (data.iceServers || data.ice_servers || []) as any[];
      const normalized: RTCIceServer[] = iceServersRaw.map((srv) => {
        const urls = srv.urls as string | string[];
        const entry: RTCIceServer = { urls } as RTCIceServer;
        if (srv.username) entry.username = srv.username;
        if (srv.credential) entry.credential = srv.credential;
        return entry;
      });

      if (normalized.length > 0) {
        this.dynamicIceServers = normalized;
        const ttlStr = data.ttl ?? "3600";
        const ttl = parseInt(String(ttlStr), 10);
        const ttlMs = Number.isFinite(ttl) && ttl > 0 ? ttl * 1000 : 3600 * 1000;
        this.iceServersExpiryAt = Date.now() + ttlMs;

        try {
          window.dispatchEvent(
            new CustomEvent("webrtc-ice-servers-updated", {
              detail: { count: normalized.length, expiresAt: this.iceServersExpiryAt },
            })
          );
        } catch (_) {
          // no-op if window not available
        }
        console.log(`Fetched ${normalized.length} TURN servers (ttl=${isNaN(ttl) ? "?" : ttl}s)`);
      }
    } catch (err) {
      console.warn("Error fetching TURN credentials", err);
      // keep STUN-only
    }
  }

  public async getStream(): Promise<MediaStream> {
    return this.getLocalStream();
  }

  private async tryGetUserMedia(
    constraints: MediaConstraints
  ): Promise<MediaStream> {
    try {
      console.log("Requesting media with constraints:", constraints);
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.error("Error with constraints:", constraints, err);
      throw err;
    }
  }

  private async getLocalStream(): Promise<MediaStream> {
    if (this.localStream) {
      return this.localStream;
    }

    // Try different constraints in order of preference
    const constraintsOptions: MediaConstraints[] = [
      // First try with both video and audio
      {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: true,
      },
      // Then try with just basic video and audio
      { video: true, audio: true },
      // Then try with just video, no audio
      { video: true, audio: false },
      // Finally, try with just audio, no video
      { video: false, audio: true },
    ];

    let lastError: Error | null = null;

    for (const constraints of constraintsOptions) {
      try {
        console.log("Attempting to get media with constraints:", constraints);
        this.localStream = await this.tryGetUserMedia(constraints);

        // If we only have audio but wanted video, add a black video track
        if (
          constraints.video &&
          this.localStream &&
          this.localStream.getVideoTracks().length === 0
        ) {
          console.log("Adding black video track as fallback");
          this.addBlackVideoTrack(this.localStream);
        }

        return this.localStream;
      } catch (err) {
        console.error(
          "Failed to get media with constraints:",
          constraints,
          err
        );
        lastError = err as Error;
        // Continue to next constraints option
      }
    }

    // If we got here, we couldn't get any media
    console.error(
      "Failed to access any media devices after trying all options"
    );
    throw lastError || new Error("Failed to access media devices");
  }

  private addBlackVideoTrack(stream: MediaStream) {
    try {
      // Create a black video track as fallback
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Fill with black
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Add text indicating camera is off
        ctx.font = "24px Arial";
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.fillText("Camera Off", canvas.width / 2, canvas.height / 2);

        // Setup periodic redrawing to keep canvas active
        setInterval(() => {
          if (ctx) {
            // Redraw the canvas
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.font = "24px Arial";
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.fillText("Camera Off", canvas.width / 2, canvas.height / 2);
            // Add timestamp to force update
            ctx.font = "12px Arial";
            ctx.fillText(
              new Date().toLocaleTimeString(),
              canvas.width / 2,
              canvas.height - 20
            );
          }
        }, 1000);
      }

      // Get stream from canvas
      const blackVideoStream = canvas.captureStream(5); // 5 fps

      // Add track to original stream
      const [videoTrack] = blackVideoStream.getVideoTracks();
      if (videoTrack) {
        videoTrack.enabled = false;
        stream.addTrack(videoTrack);
      }
    } catch (err) {
      console.error("Failed to create fallback video track:", err);
    }
  }

  public async initiateCall(userId: string) {
    try {
      console.log(`Initiating call to ${userId}`);
      const peerConnection = await this.createPeerConnection(userId);
      const offer = await peerConnection.connection.createOffer();
      await peerConnection.connection.setLocalDescription(offer);
      this.socket.emit("webrtc_offer", offer, userId);

      // Set a connection timeout
      this.setConnectionTimeout(userId);
    } catch (err) {
      console.error("Error initiating call:", err);
      this.emitConnectionError(userId, "initiate-call-error");
      throw err;
    }
  }

  public async toggleAudio(enabled: boolean) {
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks.forEach((track) => {
          track.enabled = enabled;
        });
        console.log(`Audio ${enabled ? "enabled" : "disabled"}`);
      } else if (enabled) {
        // If no audio tracks and trying to enable, try to add an audio track
        try {
          console.log("Attempting to add audio track");
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          const [audioTrack] = audioStream.getAudioTracks();
          if (audioTrack && this.localStream) {
            this.localStream.addTrack(audioTrack);
            console.log("Audio track added successfully");
          }
        } catch (err) {
          console.error("Failed to add audio track:", err);
          throw err;
        }
      }
    }
  }

  public async toggleVideo(enabled: boolean) {
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks.forEach((track) => {
          track.enabled = enabled;
        });
        console.log(`Video ${enabled ? "enabled" : "disabled"}`);
      } else if (enabled) {
        // If no video tracks and trying to enable, try to add a video track
        try {
          console.log("Attempting to add video track");
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
          const [videoTrack] = videoStream.getVideoTracks();
          if (videoTrack && this.localStream) {
            this.localStream.addTrack(videoTrack);
            console.log("Video track added successfully");
          }
        } catch (err) {
          console.error("Failed to add video track:", err);
          this.addBlackVideoTrack(this.localStream);
          throw err;
        }
      }
    }
  }

  public getPeerConnection(userId: string): PeerConnection | undefined {
    return this.peerConnections.get(userId);
  }

  public getAllPeerConnections(): Map<string, PeerConnection> {
    return this.peerConnections;
  }

  private removePeerConnection(userId: string) {
    const peerConnection = this.peerConnections.get(userId);
    if (peerConnection) {
      console.log(`Removing peer connection for ${userId}`);
      // Dispatch an event before removing
      window.dispatchEvent(
        new CustomEvent("peer-disconnected", {
          detail: { userId },
        })
      );

      // Clear any timeout
      this.clearConnectionTimeout(userId);

      // Close the connection
      peerConnection.connection.close();
      this.peerConnections.delete(userId);
      this.reconnectAttempts.delete(userId);

      // Clear stats monitoring
      this.clearStatsMonitoring(userId);
    }
  }

  public cleanup() {
    console.log("Cleaning up all WebRTC connections");
    this.peerConnections.forEach((peer, userId) => {
      // Dispatch event before closing
      window.dispatchEvent(
        new CustomEvent("peer-disconnected", {
          detail: { userId },
        })
      );

      // Clear any timeout
      this.clearConnectionTimeout(userId);

      peer.connection.close();
    });
    this.peerConnections.clear();
    this.reconnectAttempts.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
  }

  // Add method to monitor connection stats for debugging
  private monitorConnectionStats(userId: string) {
    const peerConnection = this.peerConnections.get(userId);
    if (!peerConnection) return;

    const connection = peerConnection.connection;
    const statsInterval = setInterval(async () => {
      if (!this.peerConnections.has(userId)) {
        clearInterval(statsInterval);
        return;
      }

      try {
        const stats = await connection.getStats();
        let packetLoss = false;
        let highLatency = false;

        stats.forEach((report) => {
          if (report.type === "inbound-rtp" && report.kind === "video") {
            if (report.packetsLost > 0) {
              const lossRate = report.packetsLost / report.packetsReceived;
              if (lossRate > 0.05) {
                // 5% packet loss
                packetLoss = true;
                console.warn(
                  `High packet loss detected: ${Math.round(lossRate * 100)}%`
                );
              }
            }
          }

          if (
            report.type === "candidate-pair" &&
            report.state === "succeeded"
          ) {
            if (
              report.currentRoundTripTime &&
              report.currentRoundTripTime > 0.5
            ) {
              highLatency = true;
              console.warn(
                `High latency detected: ${Math.round(
                  report.currentRoundTripTime * 1000
                )}ms`
              );
            }
          }
        });

        if (packetLoss || highLatency) {
          // Emit an event for UI to show connection quality warning
          window.dispatchEvent(
            new CustomEvent("webrtc-connection-quality-issue", {
              detail: {
                userId,
                packetLoss,
                highLatency,
                message: "Poor connection quality detected.",
              },
            })
          );
        }
      } catch (err) {
        console.error("Error monitoring connection stats:", err);
      }
    }, 5000); // Check every 5 seconds

    // Store the interval to clear it later
    this.statsIntervals.set(userId, statsInterval);
  }

  private statsIntervals: Map<string, NodeJS.Timeout> = new Map();

  private clearStatsMonitoring(userId: string) {
    const interval = this.statsIntervals.get(userId);
    if (interval) {
      clearInterval(interval);
      this.statsIntervals.delete(userId);
    }
  }
}

export default WebRTCService;
