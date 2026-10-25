import React, { useState, useEffect, useRef, useCallback } from "react";
import Login from "./components/Login";
import OfficeHeader from "./components/OfficeHeader";
import OfficeCanvas from "./components/OfficeCanvas";
import UserList from "./components/UserList";
import AudioControls from "./components/AudioControls";
import Toolbar from "./components/Toolbar";
import { OFFICE_CONFIG } from "./utils/officeLayout";
import {
  stepAvatarMovement,
  interpolateRemoteAvatar,
  moveWithSliding,
  selectValidDestination,
  checkCollision,
} from "./utils/movement";
import { useMicrophone } from "./hooks/useMicrophone";
import { useSpatialAudio } from "./hooks/useSpatialAudio";
import { useSocket } from "./hooks/useSocket";
import "./styles/Office.css";

const INITIAL_MOCK_USERS = [
  { id: "bot-1", username: "User A (Aarav)", x: 185, y: 145, targetX: 220, targetY: 160, color: "#0ea5e9", muted: false, isBot: true },
  { id: "bot-2", username: "User B (Priya)", x: 245, y: 145, targetX: 280, targetY: 260, color: "#8b5cf6", muted: false, isBot: true },
  { id: "bot-3", username: "User C (Rohan)", x: 470, y: 120, targetX: 460, targetY: 270, color: "#10b981", muted: false, isBot: true },
  { id: "bot-4", username: "User D (Meera)", x: 140, y: 380, targetX: 290, targetY: 280, color: "#f59e0b", muted: false, isBot: true },
  { id: "bot-5", username: "User E (Vikram)", x: 490, y: 390, targetX: 350, targetY: 140, color: "#ec4899", muted: true, isBot: true },
];

function App() {
  const [username, setUsername] = useState("");
  const [audioRadius, setAudioRadius] = useState(OFFICE_CONFIG.defaultAudioRadius);
  const [localAutoWalk, setLocalAutoWalk] = useState(false);
  const [remoteAutoWalk, setRemoteAutoWalk] = useState(true);

  // Mutable 60fps world state in ref so Canvas & Web Audio run without 60fps React rerenders
  const worldRef = useRef({
    localUser: {
      id: `sim-${Math.random().toString(36).slice(2, 8)}`,
      username: "",
      x: 205,
      y: 155,
      targetX: 205,
      targetY: 155,
      direction: 0,
      muted: true,
      isLocal: true,
      color: "#0284c7",
    },
    remoteUsers: INITIAL_MOCK_USERS,
  });

  // Throttled (10 Hz) snapshot for the React sidebar UI
  const [uiSnapshot, setUiSnapshot] = useState(() => ({
    localUser: worldRef.current.localUser,
    remoteUsers: worldRef.current.remoteUsers,
  }));

  const keysPressedRef = useRef(new Set());


const handleAssignedIdentity = useCallback((identity) => {
  if (!identity || !identity.id) return;

  const currentUser = worldRef.current.localUser;

  const assignedX =
    typeof identity.x === "number" ? identity.x : currentUser.x;
  const assignedY =
    typeof identity.y === "number" ? identity.y : currentUser.y;

  const spawn = checkCollision(assignedX, assignedY)
    ? selectValidDestination()
    : { x: assignedX, y: assignedY };

  worldRef.current.localUser = {
    ...currentUser,
    id: identity.id,
    x: spawn.x,
    y: spawn.y,
    targetX: spawn.x,
    targetY: spawn.y,
  };
}, []);


  // Filter strictly by unique user ID (never by username)
  const handleRemoteUsersSync = useCallback((serverUsers, mySocketId) => {
    const localId = mySocketId || worldRef.current.localUser.id;
    const prevMap = new Map(worldRef.current.remoteUsers.map((u) => [u.id, u]));
    const palette = ["#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4"];

    const synced = serverUsers
      .filter((u) => u && u.id && u.id !== localId)
      .map((u, idx) => {
        const existing = prevMap.get(u.id);
        return {
          id: u.id,
          username: u.username || "Colleague",
          x: existing ? existing.x : u.x,
          y: existing ? existing.y : u.y,
          serverX: u.x,
          serverY: u.y,
          direction: u.direction || 0,
          muted: Boolean(u.muted),
          color: existing ? existing.color : palette[idx % palette.length],
          isBot: false,
        };
      });

    worldRef.current.remoteUsers = synced;
  }, []);

  const handleRemoteUserMoved = useCallback((movedUser) => {
    worldRef.current.remoteUsers = worldRef.current.remoteUsers.map((u) =>
      u.id === movedUser.id
        ? {
            ...u,
            serverX: movedUser.x,
            serverY: movedUser.y,
            direction: movedUser.direction || u.direction,
            muted: typeof movedUser.muted === "boolean" ? movedUser.muted : u.muted,
          }
        : u
    );
  }, []);

  const handleUserJoined = useCallback((newUser) => {
    if (!newUser || !newUser.id || newUser.id === worldRef.current.localUser.id) return;
    const exists = worldRef.current.remoteUsers.some((u) => u.id === newUser.id);
    if (!exists) {
      worldRef.current.remoteUsers = [
        ...worldRef.current.remoteUsers,
        {
          id: newUser.id,
          username: newUser.username || "Colleague",
          x: newUser.x || 200,
          y: newUser.y || 200,
          serverX: newUser.x || 200,
          serverY: newUser.y || 200,
          direction: newUser.direction || 0,
          muted: Boolean(newUser.muted),
          color: "#0ea5e9",
          isBot: false,
        },
      ];
    }
  }, []);

  const handleUserLeft = useCallback((leftId) => {
    worldRef.current.remoteUsers = worldRef.current.remoteUsers.filter(
      (u) => u.id !== leftId
    );
  }, []);

  const {
    connectionState,
    serverUrl,
    connectToBackend,
    switchToSimulation,
    emitPositionUpdate,
    emitMuteStatus,
  } = useSocket({
    username,
    localMuted: worldRef.current.localUser.muted,
    onAssignedIdentity: handleAssignedIdentity,
    onRemoteUsersSync: handleRemoteUsersSync,
    onRemoteUserMoved: handleRemoteUserMoved,
    onUserJoined: handleUserJoined,
    onUserLeft: handleUserLeft,
  });

  const handleMuteChanged = useCallback(
    (isMuted) => {
      worldRef.current.localUser = {
        ...worldRef.current.localUser,
        muted: Boolean(isMuted),
      };
      emitMuteStatus(Boolean(isMuted));
    },
    [emitMuteStatus]
  );

  const {
    micEnabled,
    micMuted,
    speakerMuted,
    micError,
    enableMicrophone,
    toggleMicMute,
    toggleSpeakerMute,
    stopMicrophone,
  } = useMicrophone({ onMuteChanged: handleMuteChanged });

  // Attempt backend connection automatically on login; falls back to simulation if server is offline
  useEffect(() => {
    if (username) {
      connectToBackend();
    }
  }, [username, connectToBackend]);

  // Restore simulation bots when switching back to simulation mode
  useEffect(() => {
    if (connectionState === "simulation" && worldRef.current.remoteUsers.every((u) => !u.isBot)) {
      worldRef.current.remoteUsers = INITIAL_MOCK_USERS;
    }
  }, [connectionState]);

  const { spatialMetrics } = useSpatialAudio(
    worldRef,
    audioRadius,
    speakerMuted,
    connectionState,
    micEnabled
  );

  // Sync username & mute flag into worldRef
  useEffect(() => {
    worldRef.current.localUser = {
      ...worldRef.current.localUser,
      username,
      muted: micMuted || !micEnabled,
    };
  }, [username, micMuted, micEnabled]);

  // 60 FPS Physics & Movement Loop (StrictMode-safe: zero side effects inside React state updaters)
  useEffect(() => {
    if (!username) return undefined;
    let lastTime = performance.now();
    let frameId;

    function tick(now) {
      const dt = Math.min(Math.max((now - lastTime) / 1000, 0.001), 0.1);
      lastTime = now;

      let me = worldRef.current.localUser;
      const keys = keysPressedRef.current;
      let keyVx = 0;
      let keyVy = 0;
      if (keys.has("ArrowUp") || keys.has("KeyW")) keyVy -= 1;
      if (keys.has("ArrowDown") || keys.has("KeyS")) keyVy += 1;
      if (keys.has("ArrowLeft") || keys.has("KeyA")) keyVx -= 1;
      if (keys.has("ArrowRight") || keys.has("KeyD")) keyVx += 1;

      if (keyVx !== 0 || keyVy !== 0) {
        const len = Math.hypot(keyVx, keyVy);
        const speed = 135;
        const dx = (keyVx / len) * speed * dt;
        const dy = (keyVy / len) * speed * dt;
        const moved = moveWithSliding(
          me.x,
          me.y,
          dx,
          dy,
          OFFICE_CONFIG.avatarRadius,
          OFFICE_CONFIG
        );
        const angle = Math.atan2(dy, dx);
        me = {
          ...me,
          x: moved.x,
          y: moved.y,
          targetX: moved.x,
          targetY: moved.y,
          direction: angle,
        };
        emitPositionUpdate(me.x, me.y, angle, me.muted);
      } else if (localAutoWalk) {
        me = stepAvatarMovement(me, dt, 75, OFFICE_CONFIG);
        emitPositionUpdate(me.x, me.y, me.direction, me.muted);
      } else {
        const dx = me.targetX - me.x;
        const dy = me.targetY - me.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 2) {
          const step = Math.min(dist, 120 * dt);
          const angle = Math.atan2(dy, dx);
          const moved = moveWithSliding(
            me.x,
            me.y,
            Math.cos(angle) * step,
            Math.sin(angle) * step,
            OFFICE_CONFIG.avatarRadius,
            OFFICE_CONFIG
          );
          if (moved.blocked) {
            me = { ...me, targetX: me.x, targetY: me.y };
          } else {
            me = { ...me, x: moved.x, y: moved.y, direction: angle };
            emitPositionUpdate(me.x, me.y, angle, me.muted);
          }
        }
      }
      worldRef.current.localUser = me;

      // Update remote avatars: autonomous movement in simulation, smooth lerp in live connected mode
      if (connectionState === "simulation") {
        if (remoteAutoWalk) {
          worldRef.current.remoteUsers = worldRef.current.remoteUsers.map((peer) =>
            stepAvatarMovement(peer, dt, 58, OFFICE_CONFIG)
          );
        }
      } else {
        worldRef.current.remoteUsers = worldRef.current.remoteUsers.map((peer) =>
          interpolateRemoteAvatar(peer, dt, 10)
        );
      }

      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [username, localAutoWalk, remoteAutoWalk, connectionState, emitPositionUpdate]);

  // Throttled 10 Hz UI snapshot sync for sidebar
  useEffect(() => {
    if (!username) return undefined;
    const timer = setInterval(() => {
      setUiSnapshot({
        localUser: { ...worldRef.current.localUser },
        remoteUsers: worldRef.current.remoteUsers.map((u) => ({ ...u })),
      });
    }, 100);
    return () => clearInterval(timer);
  }, [username]);

  // Held-key listener with preventDefault for Arrow keys
  useEffect(() => {
    if (!username) return undefined;
    const navCodes = new Set([
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
    ]);

    function handleKeyDown(e) {
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
      if (navCodes.has(e.code)) {
        e.preventDefault();
        setLocalAutoWalk(false);
        keysPressedRef.current.add(e.code);
      }
    }

    function handleKeyUp(e) {
      keysPressedRef.current.delete(e.code);
    }

    function handleBlur() {
      keysPressedRef.current.clear();
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [username]);

  function handleSelectLocalTarget({ x, y }) {
    if (!checkCollision(x, y, OFFICE_CONFIG.avatarRadius, OFFICE_CONFIG)) {
      setLocalAutoWalk(false);
      worldRef.current.localUser = {
        ...worldRef.current.localUser,
        targetX: x,
        targetY: y,
      };
    }
  }

  function handleAddMockUser() {
    const dest = selectValidDestination(OFFICE_CONFIG);
    const start = selectValidDestination(OFFICE_CONFIG);
    const idx = worldRef.current.remoteUsers.length + 1;
    worldRef.current.remoteUsers = [
      ...worldRef.current.remoteUsers,
      {
        id: `bot-${Date.now()}`,
        username: `User ${String.fromCharCode(64 + idx)}`,
        x: start.x,
        y: start.y,
        targetX: dest.x,
        targetY: dest.y,
        color: "#06b6d4",
        muted: false,
        isBot: true,
      },
    ];
  }

  function handleLeaveOffice() {
    stopMicrophone();
    setUsername("");
  }

  if (!username) {
    return <Login onJoin={setUsername} />;
  }

  return (
    <div className="office-shell">
      <OfficeHeader
        username={username}
        localId={uiSnapshot.localUser.id}
        connectionState={connectionState}
        serverUrl={serverUrl}
        onConnectLive={connectToBackend}
        onUseSimulation={switchToSimulation}
        onLeaveOffice={handleLeaveOffice}
      />

      <main className="office-main-grid">
        <div className="canvas-stage-card">
          <OfficeCanvas
            worldRef={worldRef}
            audioRadius={audioRadius}
            speakerMuted={speakerMuted}
            onSelectLocalTarget={handleSelectLocalTarget}
          />
          <Toolbar
            localAutoWalk={localAutoWalk}
            remoteAutoWalk={remoteAutoWalk}
            connectionState={connectionState}
            onToggleLocalAutoWalk={() => setLocalAutoWalk((v) => !v)}
            onToggleRemoteAutoWalk={() => setRemoteAutoWalk((v) => !v)}
            onAddMockUser={handleAddMockUser}
          />
        </div>

        <aside className="office-sidebar">
          <UserList
            localUser={uiSnapshot.localUser}
            remoteUsers={uiSnapshot.remoteUsers}
            spatialMetrics={spatialMetrics}
          />
          <AudioControls
            micEnabled={micEnabled}
            micMuted={micMuted}
            speakerMuted={speakerMuted}
            micError={micError}
            audioRadius={audioRadius}
            onEnableMic={enableMicrophone}
            onToggleMicMute={toggleMicMute}
            onToggleSpeakerMute={toggleSpeakerMute}
            onChangeRadius={setAudioRadius}
          />
        </aside>
      </main>
    </div>
  );
}

export default App;
