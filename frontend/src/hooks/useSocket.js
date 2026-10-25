import { useEffect, useRef, useState, useCallback } from "react";
import { socket, getConfiguredServerUrl } from "../services/socket";
import { webrtcManager } from "../services/webrtc";

export function useSocket({
  username,
  localMuted,
  onAssignedIdentity,
  onRemoteUsersSync,
  onRemoteUserMoved,
  onUserJoined,
  onUserLeft,
}) {
  const [connectionState, setConnectionState] = useState("simulation");
  const [serverError, setServerError] = useState("");
  const lastEmitRef = useRef(0);

  const connectToBackend = useCallback(() => {
    if (!username) return;
    setConnectionState("connecting");
    setServerError("");
    socket.connect();
  }, [username]);

  const switchToSimulation = useCallback(() => {
    if (socket.connected) {
      socket.disconnect();
    }
    webrtcManager.closeAll();
    setConnectionState("simulation");
    setServerError("");
  }, []);

  const trailingTimerRef = useRef(null);
  const latestPosPayloadRef = useRef(null);

  const emitPositionUpdate = useCallback((x, y, direction = 0, muted = false) => {
    const payload = {
      x: Math.round(x),
      y: Math.round(y),
      direction,
      muted: Boolean(muted),
    };
    latestPosPayloadRef.current = payload;

    const now = performance.now();
    const elapsed = now - lastEmitRef.current;

    if (elapsed >= 50) {
      if (trailingTimerRef.current) {
        clearTimeout(trailingTimerRef.current);
        trailingTimerRef.current = null;
      }
      lastEmitRef.current = now;
      if (socket.connected) {
        socket.emit("position-update", payload);
      }
    } else if (!trailingTimerRef.current) {
      trailingTimerRef.current = setTimeout(() => {
        trailingTimerRef.current = null;
        lastEmitRef.current = performance.now();
        if (socket.connected && latestPosPayloadRef.current) {
          socket.emit("position-update", latestPosPayloadRef.current);
        }
      }, 50 - elapsed);
    }
  }, []);

  const emitMuteStatus = useCallback((muted) => {
    if (socket.connected) {
      socket.emit("mute-status", { muted: Boolean(muted) });
    }
  }, []);

  useEffect(() => {
    if (!username) return undefined;

    webrtcManager.initialize(socket);

    function handleConnect() {
      setConnectionState("connected");
      setServerError("");
      if (onAssignedIdentity) {
        onAssignedIdentity({ id: socket.id });
      }
      socket.emit("join-office", { username, muted: Boolean(localMuted) });
    }

    function handleSessionConfirmed(me) {
      if (me && me.id && onAssignedIdentity) {
        onAssignedIdentity(me);
      }
    }

    function handleConnectError(err) {
      setConnectionState("simulation");
      setServerError(
        `Live Socket.IO server at ${getConfiguredServerUrl()} unreachable (${err.message}). Running local multiplayer simulation.`
      );
    }

    function handleDisconnect() {
      webrtcManager.closeAll();
      setConnectionState((prev) => (prev === "simulation" ? "simulation" : "disconnected"));
    }

    function handleUsersUpdate(users) {
      if (Array.isArray(users) && onRemoteUsersSync) {
        onRemoteUsersSync(users, socket.id);
      }
    }

    function handleUserMoved(user) {
      if (user && user.id && user.id !== socket.id && onRemoteUserMoved) {
        onRemoteUserMoved(user);
      }
    }

    function handleUserJoined(user) {
      if (user && user.id !== socket.id && onUserJoined) {
        onUserJoined(user);
      }
    }

    function handleUserLeft(payload) {
      if (payload && payload.id) {
        webrtcManager.closePeer(payload.id);
        if (onUserLeft) onUserLeft(payload.id);
      }
    }

    socket.on("connect", handleConnect);
    socket.on("session-confirmed", handleSessionConfirmed);
    socket.on("connect_error", handleConnectError);
    socket.on("disconnect", handleDisconnect);
    socket.on("users-update", handleUsersUpdate);
    socket.on("user-moved", handleUserMoved);
    socket.on("user-joined", handleUserJoined);
    socket.on("user-left", handleUserLeft);
    socket.on("webrtc-offer", (data) => webrtcManager.handleIncomingOffer(data));
    socket.on("webrtc-answer", (data) => webrtcManager.handleIncomingAnswer(data));
    socket.on("webrtc-ice-candidate", (data) => webrtcManager.handleIncomingIceCandidate(data));

    return () => {
      socket.off("connect", handleConnect);
      socket.off("session-confirmed", handleSessionConfirmed);
      socket.off("connect_error", handleConnectError);
      socket.off("disconnect", handleDisconnect);
      socket.off("users-update", handleUsersUpdate);
      socket.off("user-moved", handleUserMoved);
      socket.off("user-joined", handleUserJoined);
      socket.off("user-left", handleUserLeft);
      socket.off("webrtc-offer");
      socket.off("webrtc-answer");
      socket.off("webrtc-ice-candidate");
      socket.disconnect();
      webrtcManager.closeAll();
    };
  }, [username]);

  return {
    connectionState,
    serverError,
    serverUrl: getConfiguredServerUrl(),
    connectToBackend,
    switchToSimulation,
    emitPositionUpdate,
    emitMuteStatus,
  };
}
