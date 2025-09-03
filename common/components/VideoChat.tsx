import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  BsCameraVideo,
  BsCameraVideoOff,
  BsMic,
  BsMicMute,
} from "react-icons/bs";
import { MdCallEnd, MdCall } from "react-icons/md";
import { FaSpinner } from "react-icons/fa";
import WebRTCService from "../lib/webrtc";
import { socket } from "@/common/lib/socket";
import { toast } from "react-toastify";
import { FiPhone, FiPhoneOff } from "react-icons/fi";
import { TbMicrophone, TbMicrophoneOff } from "react-icons/tb";
import { MdOutlineVideocam, MdOutlineVideocamOff } from "react-icons/md";

interface VideoChatProps {
  userId: string | null;
  onClose: () => void;
  open: boolean;
}

type CallState = "inactive" | "calling" | "connected";

const VideoChat = ({ userId, onClose, open }: VideoChatProps) => {
  const [callState, setCallState] = useState<CallState>("inactive");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<string>("");
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const webRTCServiceRef = useRef<WebRTCService | null>(null);
  const [isCallActive, setIsCallActive] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const initializeWebRTCService = useCallback(() => {
    if (!webRTCServiceRef.current) {
      webRTCServiceRef.current = new WebRTCService(socket);
    }
    return webRTCServiceRef.current;
  }, []);

  const handleCall = useCallback(async () => {
    try {
      setCallState("calling");

      if (!userId) {
        toast.error("No user to call");
        setCallState("inactive");
        return;
      }

      const webRTCService = initializeWebRTCService();

      const stream = await webRTCService.getStream();

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      await webRTCService.initiateCall(userId);
      setConnectionStatus("Establishing connection...");
    } catch (err) {
      console.error("Error initiating call:", err);
      toast.error(
        "Failed to initiate call. Please check your camera and microphone permissions."
      );
      setCallState("inactive");
    }
  }, [userId, initializeWebRTCService]);

  const handleEndCall = useCallback(() => {
    if (!webRTCServiceRef.current) return;

    webRTCServiceRef.current.cleanup();
    webRTCServiceRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setCallState("inactive");
    setConnectionStatus("");
    setIsReconnecting(false);
  }, []);

  const handleToggleAudio = useCallback(async () => {
    try {
      if (!webRTCServiceRef.current) return;

      await webRTCServiceRef.current.toggleAudio(!audioEnabled);
      setAudioEnabled(!audioEnabled);
    } catch (err) {
      console.error("Error toggling audio:", err);
      toast.error("Failed to toggle audio");
    }
  }, [audioEnabled]);

  const handleToggleVideo = useCallback(async () => {
    try {
      if (!webRTCServiceRef.current) return;

      await webRTCServiceRef.current.toggleVideo(!videoEnabled);
      setVideoEnabled(!videoEnabled);
    } catch (err) {
      console.error("Error toggling video:", err);
      toast.error("Failed to toggle video");
    }
  }, [videoEnabled]);

  const handlePeerConnectionFailed = useCallback(
    (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.userId === userId) {
        setIsCallActive(false);
        setIsLoading(false);
        toast.error(
          `${customEvent.detail.message || "Call connection failed"}`
        );
        if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
          remoteVideoRef.current.srcObject = null;
        }
      }
    },
    [userId]
  );

  const handlePeerDisconnected = useCallback(
    (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.userId === userId) {
        setIsCallActive(false);
        setIsLoading(false);
        toast.error(
          `${customEvent.detail.message || "Call ended unexpectedly"}`
        );
        if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
          remoteVideoRef.current.srcObject = null;
        }
      }
    },
    [userId]
  );

  const handleConnectionStateChange = useCallback(
    (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.userId === userId) {
        const state = customEvent.detail.state;

        switch (state) {
          case "checking":
            setConnectionStatus("Checking connection...");
            break;
          case "connected":
            setConnectionStatus("Connected");
            setCallState("connected");
            setIsReconnecting(false);
            break;
          case "completed":
            setConnectionStatus("Connection established");
            setCallState("connected");
            setIsReconnecting(false);
            break;
          case "disconnected":
            setConnectionStatus(
              "Connection interrupted, trying to reconnect..."
            );
            setIsReconnecting(true);
            break;
          case "failed":
            setConnectionStatus("Connection failed");
            setIsReconnecting(true);
            break;
          default:
            setConnectionStatus(state);
        }
      }
    },
    [userId]
  );

  const handleRemoteStreamUpdated = useCallback(
    (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.userId === userId && customEvent.detail?.stream) {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = customEvent.detail.stream;
        }
        setCallState("connected");
      }
    },
    [userId]
  );

  const handleWebRTCError = useCallback(
    (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.userId === userId) {
        const errorType = customEvent.detail.errorType;
        console.error(`WebRTC error: ${errorType}`);

        // Only show toast for certain errors
        if (errorType === "offer-error" || errorType === "answer-error") {
          toast.error(`Connection error: ${errorType}`);
        }
      }
    },
    [userId]
  );

  const handleConnectionTimeout = useCallback(
    (event: CustomEvent) => {
      if (event.detail.userId === userId) {
        setIsCallActive(false);
        setIsLoading(false);
        toast.error(`${event.detail.message || "Call connection timed out"}`);
        if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
          remoteVideoRef.current.srcObject = null;
        }
      }
    },
    [userId]
  );

  const clearConnectionTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleIceServersUpdated = useCallback((event: Event) => {
    const customEvent = event as CustomEvent;
    const count = customEvent.detail?.count as number | undefined;
    const expiresAt = customEvent.detail?.expiresAt as number | undefined;
    const minsLeft = expiresAt
      ? Math.max(0, Math.round((expiresAt - Date.now()) / 60000))
      : undefined;
    toast.info(
      `TURN servers updated${
        typeof count === "number" ? ` (${count})` : ""
      }${typeof minsLeft === "number" ? ` · ~${minsLeft}m TTL` : ""}`
    );
  }, []);

  const handleSignalingDisconnected = useCallback((event: Event) => {
    const customEvent = event as CustomEvent;
    const message =
      customEvent.detail?.message || "Signaling disconnected. Reconnecting...";
    toast.warn(message);
    setIsReconnecting(true);
    setConnectionStatus("Signaling disconnected, attempting reconnection...");
  }, []);

  const handleConnectionQualityIssue = useCallback(
    (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.userId === userId) {
        const { packetLoss, highLatency } = customEvent.detail || {};
        const labels = [
          packetLoss ? "packet loss" : null,
          highLatency ? "high latency" : null,
        ].filter(Boolean);
        const suffix = labels.length ? ` (${labels.join(", ")})` : "";
        toast.warn(
          `${customEvent.detail?.message || "Connection quality issue"}${suffix}`
        );
      }
    },
    [userId]
  );

  const startCall = useCallback(async () => {
    if (!webRTCServiceRef.current || !userId) return;

    try {
      setError(null);
      setIsLoading(true);

      // Clear any existing timeout
      clearConnectionTimeout();

      await webRTCServiceRef.current.initiateCall(userId);

      // Set a timeout to detect if call connection fails
      timeoutRef.current = setTimeout(() => {
        // Check the current state directly when the timeout executes
        if (!isCallActive) {
          setIsLoading(false);
          setError("Call connection timed out. Please try again.");

          // Attempt to automatically restart the call process if it failed
          if (webRTCServiceRef.current && !isCallActive) {
            // We'll automatically retry once after 2 seconds
            setTimeout(() => {
              if (!isCallActive && !isLoading) {
                toast.info("Attempting to reconnect automatically...");
                startCall().catch((err) => {
                  console.error("Auto-reconnect failed:", err);
                  setError("Automatic reconnect failed. Please try manually.");
                });
              }
            }, 2000);
          }
        }
      }, 20000); // 20 seconds timeout (increased from 15s)
    } catch (err) {
      console.error("Failed to start call:", err);
      setError("Failed to start call. Please try again.");
      setIsLoading(false);
    }
  }, [userId, clearConnectionTimeout, isCallActive, isLoading]);

  useEffect(() => {
    if (open && userId && callState === "inactive") {
      handleCall();
    }
  }, [open, userId, callState, handleCall]);

  useEffect(() => {
    if (!open) {
      handleEndCall();
    }
  }, [open, handleEndCall]);

  useEffect(() => {
    window.addEventListener("remote-stream-updated", handleRemoteStreamUpdated);
    window.addEventListener(
      "peer-disconnected",
      handlePeerDisconnected as EventListener
    );
    window.addEventListener(
      "peer-connection-failed",
      handlePeerConnectionFailed as EventListener
    );
    window.addEventListener(
      "ice-connection-state-change",
      handleConnectionStateChange
    );
    window.addEventListener("webrtc-connection-error", handleWebRTCError);
    window.addEventListener(
      "peer-connection-timeout",
      handleConnectionTimeout as EventListener
    );
    window.addEventListener(
      "webrtc-ice-servers-updated",
      handleIceServersUpdated as EventListener
    );
    window.addEventListener(
      "webrtc-signaling-disconnected",
      handleSignalingDisconnected as EventListener
    );
    window.addEventListener(
      "webrtc-connection-quality-issue",
      handleConnectionQualityIssue as EventListener
    );

    return () => {
      window.removeEventListener(
        "remote-stream-updated",
        handleRemoteStreamUpdated
      );
      window.removeEventListener(
        "peer-disconnected",
        handlePeerDisconnected as EventListener
      );
      window.removeEventListener(
        "peer-connection-failed",
        handlePeerConnectionFailed as EventListener
      );
      window.removeEventListener(
        "ice-connection-state-change",
        handleConnectionStateChange
      );
      window.removeEventListener("webrtc-connection-error", handleWebRTCError);
      window.removeEventListener(
        "peer-connection-timeout",
        handleConnectionTimeout as EventListener
      );
      window.removeEventListener(
        "webrtc-ice-servers-updated",
        handleIceServersUpdated as EventListener
      );
      window.removeEventListener(
        "webrtc-signaling-disconnected",
        handleSignalingDisconnected as EventListener
      );
      window.removeEventListener(
        "webrtc-connection-quality-issue",
        handleConnectionQualityIssue as EventListener
      );
    };
  }, [
    handleRemoteStreamUpdated,
    handlePeerDisconnected,
    handlePeerConnectionFailed,
    handleConnectionStateChange,
    handleWebRTCError,
    handleConnectionTimeout,
    handleIceServersUpdated,
    handleSignalingDisconnected,
    handleConnectionQualityIssue,
  ]);

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  if (!open) return null;

  if (isMinimized) {
    return (
      <button
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600"
        onClick={toggleMinimize}
        aria-label="Expand video chat"
      >
        <MdOutlineVideocam className="h-6 w-6" />
        {isReconnecting && (
          <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-yellow-400"></div>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-[50px] right-5 z-40 overflow-hidden rounded-xl bg-black shadow-lg">
      <div className="relative flex h-48 w-80 flex-col items-center justify-center">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="h-full w-full object-cover"
        />

        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-2 right-2 h-20 w-28 rounded-md bg-zinc-800 object-cover shadow-sm"
        />

        {connectionStatus && (
          <div
            className={`absolute top-2 left-2 rounded-md bg-black bg-opacity-70 px-2 py-1 text-xs ${
              isReconnecting ? "text-yellow-400" : "text-white"
            }`}
          >
            {connectionStatus}
          </div>
        )}

        <button
          className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black bg-opacity-70"
          onClick={toggleMinimize}
          aria-label="Minimize video chat"
        >
          <span className="text-xs text-white">-</span>
        </button>

        <div className="absolute bottom-3 left-2 flex items-center gap-4">
          <button
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              audioEnabled ? "bg-white text-black" : "bg-red-500 text-white"
            }`}
            onClick={handleToggleAudio}
          >
            {audioEnabled ? <TbMicrophone /> : <TbMicrophoneOff />}
          </button>

          <button
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              videoEnabled ? "bg-white text-black" : "bg-red-500 text-white"
            }`}
            onClick={handleToggleVideo}
          >
            {videoEnabled ? <MdOutlineVideocam /> : <MdOutlineVideocamOff />}
          </button>

          <button
            className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white"
            onClick={onClose}
          >
            {callState === "connected" ? <FiPhoneOff /> : <FiPhone />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoChat;
