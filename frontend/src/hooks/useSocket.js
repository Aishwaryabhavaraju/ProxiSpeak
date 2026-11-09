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
  onChatReaction,
  onDirectMessage,
  onHandRaise,
  onAvatarReaction,
  onMediaState,
  onSpatialAudioUpdate,
}) {
  const [connectionState, setConnectionState] = useState("disconnected");
  const [serverError, setServerError] = useState("");
  const lastEmitRef = useRef(0);

  const connectToBackend = useCallback(() => {
    if (!username) return;
    setConnectionState("connecting");
    setServerError("");
    if (!socket.connected) {
      socket.connect();
    } else {
      // Re-emit join if already connected
      socket.emit("join-office", {
        username,
        userId: userId || username,
        roomId: roomId || "MAIN-OFFICE",
        color: color || "#818CF8",
        muted: Boolean(localMuted),
      });
    }
  }, [username, userId, roomId, color, localMuted]);

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

  const sendChatReaction = useCallback(
    ({ messageId, emoji }) => {
      if (socket.connected && messageId && emoji) {
        socket.emit("chat:reaction", {
          messageId,
          roomId: roomId || "MAIN-OFFICE",
          emoji,
          username,
        });
      }
    },
    [roomId, username]
  );

  const sendDirectMessage = useCallback(
    ({ recipientId, recipientUsername, text }) => {
      if (socket.connected && recipientId && text && text.trim()) {
        socket.emit("chat:direct-message", {
          recipientId,
          recipientUsername,
          text: text.trim(),
          senderUsername: username,
          senderColor: color || "#818CF8",
        });
      }
    },
    [username, color]
  );

  const emitHandRaise = useCallback(
    (raised) => {
      if (socket.connected) {
        socket.emit("user:hand-raise", {
          roomId: roomId || "MAIN-OFFICE",
          raised: Boolean(raised),
        });
      }
    },
    [roomId]
  );

  const emitAvatarReaction = useCallback(
    (emoji) => {
      if (socket.connected && emoji) {
        socket.emit("avatar:reaction", {
          roomId: roomId || "MAIN-OFFICE",
          emoji,
        });
      }
    },
    [roomId]
  );

  const emitMediaState = useCallback(
    (mediaState) => {
      if (socket.connected && mediaState) {
        socket.emit("webrtc:media-state", {
          roomId: roomId || "MAIN-OFFICE",
          ...mediaState,
        });
      }
    },
    [roomId]
  );

  useEffect(() => {
    if (!username) return undefined;

    webrtcManager.initialize(socket);

    function handleConnect() {
      setConnectionState("connected");
      setServerError("");
      if (onAssignedIdentity) {
        onAssignedIdentity({ id: socket.id });
      }
      socket.emit("join-office", {
        username,
        userId: userId || username,
        roomId: roomId || "MAIN-OFFICE",
        color: color || "#818CF8",
        muted: Boolean(localMuted),
      });
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

    function handleChatMessage(msg) {
      if (msg && onChatMessage) {
        onChatMessage(msg);
      }
    }

    function handleChatReaction(data) {
      if (data && onChatReaction) {
        onChatReaction(data);
      }
    }

    function handleDirectMessage(msg) {
      if (msg && onDirectMessage) {
        onDirectMessage(msg);
      }
    }

    function handleHandRaise(data) {
      if (data && onHandRaise) {
        onHandRaise(data);
      }
    }

    function handleAvatarReaction(data) {
      if (data && onAvatarReaction) {
        onAvatarReaction(data);
      }
    }

    function handleMediaState(data) {
      if (data && onMediaState) {
        onMediaState(data);
      }
    }

    function handleSpatialUpdate(data) {
      if (data && onSpatialAudioUpdate) {
        onSpatialAudioUpdate(data);
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
    socket.on("chat:reaction", handleChatReaction);
    socket.on("chat:direct-message", handleDirectMessage);
    socket.on("user:hand-raise", handleHandRaise);
    socket.on("avatar:reaction", handleAvatarReaction);
    socket.on("webrtc:media-state", handleMediaState);
    socket.on("spatial:audio:update", handleSpatialUpdate);
    socket.on("webrtc-offer", (data) => webrtcManager.handleIncomingOffer(data));
    socket.on("webrtc-answer", (data) => webrtcManager.handleIncomingAnswer(data));
    socket.on("webrtc-ice-candidate", (data) => webrtcManager.handleIncomingIceCandidate(data));

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
      socket.off("chat:reaction", handleChatReaction);
      socket.off("chat:direct-message", handleDirectMessage);
      socket.off("user:hand-raise", handleHandRaise);
      socket.off("avatar:reaction", handleAvatarReaction);
      socket.off("webrtc:media-state", handleMediaState);
      socket.off("spatial:audio:update", handleSpatialUpdate);
      socket.off("webrtc-offer");
      socket.off("webrtc-answer");
      socket.off("webrtc-ice-candidate");
      socket.disconnect();
      webrtcManager.closeAll();
    };
  }, [username, userId, roomId, color]);

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
    sendChatReaction,
    sendDirectMessage,
    emitHandRaise,
    emitAvatarReaction,
    emitMediaState,
  };
}
