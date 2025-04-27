import { useEffect, useRef, useState, useCallback } from "react";
import {
  BsCameraVideo,
  BsCameraVideoOff,
  BsMic,
  BsMicMute,
} from "react-icons/bs";
import { MdCallEnd, MdCall } from "react-icons/md";
import { FaSpinner } from "react-icons/fa";
import { toast } from "react-toastify";

import { socket } from "@/common/lib/socket";
import WebRTCService from "@/common/lib/webrtc";

interface VideoChatProps {
  userId: string;
}

const VideoChat = ({ userId }: VideoChatProps) => {
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const webrtcRef = useRef<WebRTCService | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear any existing timeout
  const clearConnectionTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const initializeWebRTC = async () => {
      try {
        setIsLoading(true);
        webrtcRef.current = new WebRTCService(socket);
        const stream = await webrtcRef.current.getStream();

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setIsLoading(false);
      } catch (error) {
        console.error("Error accessing media devices:", error);
        setError("Could not access camera or microphone");
        setIsLoading(false);
      }
    };

    initializeWebRTC();

    // Listen for remote stream updates
    const handleRemoteStream = (event: CustomEvent) => {
      const { userId: remoteId, stream } = event.detail;
      if (remoteId === userId && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        setIsCallActive(true);
        setIsLoading(false);
        clearConnectionTimeout();
      }
    };

    window.addEventListener(
      "remote-stream-updated",
      handleRemoteStream as EventListener
    );

    return () => {
      window.removeEventListener(
        "remote-stream-updated",
        handleRemoteStream as EventListener
      );
      clearConnectionTimeout();
      webrtcRef.current?.cleanup();
    };
  }, [userId, clearConnectionTimeout]);

  // Listen for peer disconnection events
  useEffect(() => {
    const handlePeerDisconnected = (event: CustomEvent) => {
      setIsCallActive(false);
      toast.error(`${event.detail.message || "Call ended unexpectedly"}`);
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject = null;
      }
    };

    const handlePeerConnectionFailed = (event: CustomEvent) => {
      setIsCallActive(false);
      setIsLoading(false);
      toast.error(`${event.detail.message || "Call connection failed"}`);
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject = null;
      }
    };

    const handleConnectionTimeout = (event: CustomEvent) => {
      setIsCallActive(false);
      setIsLoading(false);
      toast.error(`${event.detail.message || "Call connection timed out"}`);
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject = null;
      }
    };

    window.addEventListener(
      "peer-disconnected",
      handlePeerDisconnected as EventListener
    );
    window.addEventListener(
      "peer-connection-failed",
      handlePeerConnectionFailed as EventListener
    );
    window.addEventListener(
      "peer-connection-timeout",
      handleConnectionTimeout as EventListener
    );

    return () => {
      window.removeEventListener(
        "peer-disconnected",
        handlePeerDisconnected as EventListener
      );
      window.removeEventListener(
        "peer-connection-failed",
        handlePeerConnectionFailed as EventListener
      );
      window.removeEventListener(
        "peer-connection-timeout",
        handleConnectionTimeout as EventListener
      );
    };
  }, []);

  // Monitor connection state changes
  useEffect(() => {
    const handleIceConnectionStateChange = (event: CustomEvent) => {
      const { userId: remoteId, state } = event.detail;

      if (remoteId === userId) {
        if (state === "failed" || state === "disconnected") {
          setError(`Connection ${state}. Try refreshing.`);
          if (isCallActive) {
            setIsCallActive(false);
          }
        } else if (state === "connected" || state === "completed") {
          setError(null);
          setIsCallActive(true);
          setIsLoading(false);
          clearConnectionTimeout();
        }
      }
    };

    window.addEventListener(
      "ice-connection-state-change",
      handleIceConnectionStateChange as EventListener
    );

    return () => {
      window.removeEventListener(
        "ice-connection-state-change",
        handleIceConnectionStateChange as EventListener
      );
    };
  }, [userId, isCallActive, clearConnectionTimeout]);

  const startCall = async () => {
    if (!webrtcRef.current) return;

    try {
      setError(null);
      setIsLoading(true);

      // Clear any existing timeout
      clearConnectionTimeout();

      await webrtcRef.current.initiateCall(userId);

      // Set a timeout to detect if call connection fails
      timeoutRef.current = setTimeout(() => {
        // Check the current state directly when the timeout executes
        if (!isCallActive) {
          setIsLoading(false);
          setError("Call connection timed out. Please try again.");

          // Attempt to automatically restart the call process if it failed
          if (webrtcRef.current && !isCallActive) {
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
  };

  const endCall = () => {
    if (!webrtcRef.current) return;

    try {
      clearConnectionTimeout();
      webrtcRef.current.cleanup();
      setIsCallActive(false);
      setIsLoading(false);

      // Reinitialize after call ends
      const initializeAgain = async () => {
        setIsLoading(true);
        webrtcRef.current = new WebRTCService(socket);
        const stream = await webrtcRef.current.getStream();
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setIsLoading(false);
      };

      initializeAgain().catch((err) => {
        console.error("Error reinitializing after call:", err);
        setError("Error reinitializing after call");
        setIsLoading(false);
      });
    } catch (err) {
      console.error("Error ending call:", err);
      setError("Error ending call");
      setIsLoading(false);
    }
  };

  const toggleAudio = async () => {
    if (webrtcRef.current) {
      try {
        const newState = !isAudioEnabled;
        await webrtcRef.current.toggleAudio(newState);
        setIsAudioEnabled(newState);
      } catch (err) {
        console.error("Error toggling audio:", err);
        setError("Could not toggle audio");
      }
    }
  };

  const toggleVideo = async () => {
    if (webrtcRef.current) {
      try {
        const newState = !isVideoEnabled;
        await webrtcRef.current.toggleVideo(newState);
        setIsVideoEnabled(newState);
      } catch (err) {
        console.error("Error toggling video:", err);
        setError("Could not toggle video");
      }
    }
  };

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={toggleMinimize}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg hover:bg-blue-600"
          aria-label="Expand video chat"
        >
          <BsCameraVideo className="h-6 w-6" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 rounded-lg bg-gray-900/90 p-3 shadow-xl backdrop-blur-sm">
      {error && (
        <div className="mb-2 w-full rounded bg-red-500/80 px-2 py-1 text-sm text-white">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={toggleMinimize}
          className="rounded-md bg-gray-700 p-1 text-white hover:bg-gray-600"
          aria-label="Minimize"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
          </svg>
        </button>
      </div>

      <div className="flex gap-2">
        <div className="relative">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={`h-32 w-48 rounded-lg bg-black object-cover ${
              !isVideoEnabled ? "opacity-50" : ""
            }`}
          />
          {!isVideoEnabled && (
            <div className="absolute inset-0 flex items-center justify-center">
              <BsCameraVideoOff className="h-8 w-8 text-white" />
            </div>
          )}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <FaSpinner className="h-8 w-8 animate-spin text-white" />
            </div>
          )}
          <div className="absolute bottom-1 left-1 rounded bg-black/50 px-1 text-xs text-white">
            You
          </div>
        </div>

        {isCallActive && (
          <div className="relative">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-32 w-48 rounded-lg bg-black object-cover"
            />
            <div className="absolute bottom-1 left-1 rounded bg-black/50 px-1 text-xs text-white">
              Remote
            </div>
          </div>
        )}

        {!isCallActive && isLoading && (
          <div className="relative flex h-32 w-48 items-center justify-center rounded-lg bg-black">
            <div className="text-center text-white">
              <FaSpinner className="mx-auto h-8 w-8 animate-spin" />
              <div className="mt-2 text-xs">Connecting...</div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 flex w-full justify-center gap-2">
        <button
          onClick={isCallActive ? endCall : startCall}
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            isCallActive
              ? "bg-red-500 hover:bg-red-600"
              : "bg-green-500 hover:bg-green-600"
          } text-white`}
          disabled={isLoading}
          aria-label={isCallActive ? "End call" : "Start call"}
        >
          {isLoading ? (
            <FaSpinner className="h-5 w-5 animate-spin" />
          ) : isCallActive ? (
            <MdCallEnd className="h-5 w-5" />
          ) : (
            <MdCall className="h-5 w-5" />
          )}
        </button>

        <button
          onClick={toggleAudio}
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            isAudioEnabled
              ? "bg-blue-500 hover:bg-blue-600"
              : "bg-gray-500 hover:bg-gray-600"
          } text-white`}
          disabled={!isCallActive || isLoading}
          aria-label={isAudioEnabled ? "Mute audio" : "Unmute audio"}
        >
          {isAudioEnabled ? (
            <BsMic className="h-5 w-5" />
          ) : (
            <BsMicMute className="h-5 w-5" />
          )}
        </button>

        <button
          onClick={toggleVideo}
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            isVideoEnabled
              ? "bg-blue-500 hover:bg-blue-600"
              : "bg-gray-500 hover:bg-gray-600"
          } text-white`}
          disabled={!isCallActive || isLoading}
          aria-label={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
        >
          {isVideoEnabled ? (
            <BsCameraVideo className="h-5 w-5" />
          ) : (
            <BsCameraVideoOff className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
};

export default VideoChat;
