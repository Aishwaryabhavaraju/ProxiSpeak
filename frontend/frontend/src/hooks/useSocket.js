import { useEffect, useRef, useState, useCallback } from "react";
import { socket, getConfiguredServerUrl } from "../services/socket";
import { webrtcManager } from "../services/webrtc";

export function useSocket({
  username,
  userId,
  roomId,
  color,
  localMuted,
  onAssignedIdentity,
  onRemoteUsersSync,
  onRemoteUserMoved,
  onUserJoined,
  onUserLeft,
  onChatMessage,
}) {
  const [connectionState, setConnectionState] = useState("disconnected");
  const [serverError, setServerError] = useState("");
  const lastEmitRef = useRef(0);
  const trailingTimerRef = useRef(null);
  const latestPosPayloadRef = useRef(null);

  const effectiveUserId = (userId || username || "").trim();

  const connectToBackend = useCallback(() => {
    if (!username) return;
    setConnectionState("connecting");
    setServerError("");
    if (!socket.connected) {
      socket.connect();
    } else {
      socket.emit("join-office", {
        username,
        userId: effectiveUserId,
        roomId: roomId || "MAIN-OFFICE",
        color: color || "#818CF8",
        muted: Boolean(localMuted),
      });
    }
  }, [username, effectiveUserId, roomId, color, localMuted]);

  const switchToSimulation = useCallback(() => {
    if (socket.connected) {
      socket.disconnect();
    }
    webrtcManager.closeAll();
    setConnectionState("simulation");
    setServerError("");
  }, []);

  const leaveOffice = useCallback(() => {
    if (socket.connected) {
      socket.emit("leave-office");
    }
    webrtcManager.closeAll();
  }, []);

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

  const sendChatMessage = useCallback(
    (text) => {
      if (socket.connected && text && text.trim()) {
        socket.emit("chat:message", {
          roomId: roomId || "MAIN-OFFICE",
          text: text.trim(),
          username,
        });
      }
    },
    [roomId, username]
  );

  useEffect(() => {
    if (!username) return undefined;

    webrtcManager.initialize(socket, effectiveUserId);

    function handleConnect() {
      setConnectionState("connected");
      setServerError("");
      socket.emit("join-office", {
        username,
        userId: effectiveUserId,
        roomId: roomId || "MAIN-OFFICE",
        color: color || "#818CF8",
        muted: Boolean(localMuted),
      });
    }

    function handleSessionConfirmed(me) {
      if (me && (me.userId || me.id)) {
        const confirmedId = me.userId || me.id;
        webrtcManager.setLocalUserId(confirmedId);
        if (onAssignedIdentity) {
          onAssignedIdentity(me);
        }
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
      setConnectionState((prev) =>
        prev === "simulation" ? "simulation" : "disconnected"
      );
    }

    // Full-mesh WebRTC connection establishment when sync list arrives
    function handleUsersUpdate(users) {
      if (Array.isArray(users)) {
        if (onRemoteUsersSync) {
          onRemoteUsersSync(users, effectiveUserId);
        }
        // Establish WebRTC connection to every remote participant
        for (const peer of users) {
          const peerId = peer.userId || peer.id;
          if (peerId && peerId !== effectiveUserId) {
            const isInitiator = String(effectiveUserId) < String(peerId);
            webrtcManager.createPeerConnection(peerId, isInitiator);
          }
        }
      }
    }

    function handleUserMoved(user) {
      const peerId = user.userId || user.id;
      if (user && peerId && peerId !== effectiveUserId && onRemoteUserMoved) {
        onRemoteUserMoved(user);
      }
    }

    // Connect to newly joined participants immediately
    function handleUserJoined(user) {
      const peerId = user.userId || user.id;
      if (user && peerId && peerId !== effectiveUserId) {
        if (onUserJoined) onUserJoined(user);
        const isInitiator = String(effectiveUserId) < String(peerId);
        webrtcManager.createPeerConnection(peerId, isInitiator);
      }
    }

    function handleUserLeft(payload) {
      const peerId = payload?.userId || payload?.id;
      if (peerId) {
        webrtcManager.closePeer(peerId);
        if (onUserLeft) onUserLeft(peerId);
      }
    }

    function handleChatMessage(msg) {
      if (msg && onChatMessage) {
        onChatMessage(msg);
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
    socket.on("chat:message", handleChatMessage);

    // Directed WebRTC Signaling Handlers
    socket.on("webrtc-offer", (data) => webrtcManager.handleIncomingOffer(data));
    socket.on("webrtc-answer", (data) => webrtcManager.handleIncomingAnswer(data));
    socket.on("webrtc-ice-candidate", (data) =>
      webrtcManager.handleIncomingIceCandidate(data)
    );

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("session-confirmed", handleSessionConfirmed);
      socket.off("connect_error", handleConnectError);
      socket.off("disconnect", handleDisconnect);
      socket.off("users-update", handleUsersUpdate);
      socket.off("user-moved", handleUserMoved);
      socket.off("user-joined", handleUserJoined);
      socket.off("user-left", handleUserLeft);
      socket.off("chat:message", handleChatMessage);
      socket.off("webrtc-offer");
      socket.off("webrtc-answer");
      socket.off("webrtc-ice-candidate");
      socket.disconnect();
      webrtcManager.closeAll();
    };
  }, [username, effectiveUserId, roomId, color]);

  return {
    connectionState,
    serverError,
    serverUrl: getConfiguredServerUrl(),
    connectToBackend,
    switchToSimulation,
    leaveOffice,
    emitPositionUpdate,
    emitMuteStatus,
    sendChatMessage,
  };
}
