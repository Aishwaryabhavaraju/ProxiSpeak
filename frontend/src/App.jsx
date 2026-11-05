import React, { useState, useEffect, useRef, useCallback } from "react";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import OfficeHeader from "./components/OfficeHeader";
import OfficeCanvas from "./components/OfficeCanvas";
import UserList from "./components/UserList";
import TeamChat from "./components/TeamChat";
import AudioControls from "./components/AudioControls";
import Toolbar from "./components/Toolbar";
import { MessageSquare, Users } from "lucide-react";
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
import { getStoredUser, clearAuthData } from "./services/authApi";
import "./styles/Office.css";

export default function App() {
  // Authentication & Workspace State Machine
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [currentRoom, setCurrentRoom] = useState(null); // { roomId, name, description }
  const [activeSidebarTab, setActiveSidebarTab] = useState("chat"); // "chat" | "users"
  const [chatMessages, setChatMessages] = useState([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const [audioRadius, setAudioRadius] = useState(OFFICE_CONFIG.defaultAudioRadius);
  const [localAutoWalk, setLocalAutoWalk] = useState(false);

  // Mutable 60fps world state
  const worldRef = useRef({
    localUser: {
      id: `user-${Math.random().toString(36).slice(2, 8)}`,
      username: currentUser?.username || "You",
      x: 260,
      y: 220,
      targetX: 260,
      targetY: 220,
      direction: 0,
      muted: true,
      isLocal: true,
      color: currentUser?.avatarColor || "#818CF8",
    },
    remoteUsers: [],
  });

  // Throttled (10 Hz) snapshot for React UI
  const [uiSnapshot, setUiSnapshot] = useState(() => ({
    localUser: worldRef.current.localUser,
    remoteUsers: worldRef.current.remoteUsers,
  }));

  const keysPressedRef = useRef(new Set());

  // Update worldRef localUser profile when currentUser changes
  useEffect(() => {
    if (currentUser) {
      worldRef.current.localUser = {
        ...worldRef.current.localUser,
        username: currentUser.username,
        color: currentUser.avatarColor || "#818CF8",
      };
    }
  }, [currentUser]);

  const handleAssignedIdentity = useCallback((identity) => {
    if (!identity || !identity.id) return;
    const current = worldRef.current.localUser;
    const assignedX = typeof identity.x === "number" ? identity.x : current.x;
    const assignedY = typeof identity.y === "number" ? identity.y : current.y;

    const spawn = checkCollision(assignedX, assignedY)
      ? selectValidDestination()
      : { x: assignedX, y: assignedY };

    worldRef.current.localUser = {
      ...current,
      id: identity.id,
      x: spawn.x,
      y: spawn.y,
      targetX: spawn.x,
      targetY: spawn.y,
    };
  }, []);

  const handleRemoteUsersSync = useCallback((serverUsers, mySocketId) => {
    const localId = mySocketId || worldRef.current.localUser.id;
    const prevMap = new Map(worldRef.current.remoteUsers.map((u) => [u.id, u]));

    const synced = serverUsers
      .filter((u) => u && (u.id || u.userId) && (u.id !== localId && u.userId !== currentUser?.username))
      .map((u) => {
        const id = u.id || u.userId;
        const existing = prevMap.get(id);
        return {
          id,
          userId: u.userId || id,
          username: u.username || u.name || "Colleague",
          x: existing ? existing.x : (u.x || 200),
          y: existing ? existing.y : (u.y || 200),
          serverX: u.x || 200,
          serverY: u.y || 200,
          direction: u.direction || 0,
          muted: Boolean(u.muted),
          color: u.color || u.avatarColor || existing?.color || "#5EEAD4",
          isBot: false,
        };
      });

    worldRef.current.remoteUsers = synced;
  }, [currentUser]);

  const handleRemoteUserMoved = useCallback((movedUser) => {
    worldRef.current.remoteUsers = worldRef.current.remoteUsers.map((u) =>
      u.id === movedUser.id || u.userId === movedUser.userId
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
    const exists = worldRef.current.remoteUsers.some(
      (u) => u.id === newUser.id || u.userId === newUser.userId
    );
    if (!exists) {
      worldRef.current.remoteUsers = [
        ...worldRef.current.remoteUsers,
        {
          id: newUser.id,
          userId: newUser.userId || newUser.id,
          username: newUser.username || "Colleague",
          x: newUser.x || 200,
          y: newUser.y || 200,
          serverX: newUser.x || 200,
          serverY: newUser.y || 200,
          direction: newUser.direction || 0,
          muted: Boolean(newUser.muted),
          color: newUser.color || newUser.avatarColor || "#5EEAD4",
          isBot: false,
        },
      ];
    }
  }, []);

  const handleUserLeft = useCallback((leftId) => {
    worldRef.current.remoteUsers = worldRef.current.remoteUsers.filter(
      (u) => u.id !== leftId && u.userId !== leftId
    );
  }, []);

  const handleChatMessage = useCallback((msg) => {
    setChatMessages((prev) => [...prev, msg]);
    // Increment unread badge if currently viewing users tab
    setActiveSidebarTab((currentTab) => {
      if (currentTab !== "chat") {
        setUnreadChatCount((count) => count + 1);
      }
      return currentTab;
    });
  }, []);

  const {
    connectionState,
    connectToBackend,
    leaveOffice,
    emitPositionUpdate,
    emitMuteStatus,
    sendChatMessage,
  } = useSocket({
    username: currentUser?.username,
    userId: currentUser?.username,
    roomId: currentRoom?.roomId,
    color: currentUser?.avatarColor,
    localMuted: worldRef.current.localUser.muted,
    onAssignedIdentity: handleAssignedIdentity,
    onRemoteUsersSync: handleRemoteUsersSync,
    onRemoteUserMoved: handleRemoteUserMoved,
    onUserJoined: handleUserJoined,
    onUserLeft: handleUserLeft,
    onChatMessage: handleChatMessage,
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

  // Connect socket whenever currentRoom is active
  useEffect(() => {
    if (currentUser && currentRoom) {
      connectToBackend();
    }
  }, [currentUser, currentRoom, connectToBackend]);

  const { spatialMetrics } = useSpatialAudio(
    worldRef,
    audioRadius,
    speakerMuted,
    connectionState,
    micEnabled
  );

  // Sync mute flag to local avatar in worldRef
  useEffect(() => {
    worldRef.current.localUser = {
      ...worldRef.current.localUser,
      muted: micMuted || !micEnabled,
    };
  }, [micMuted, micEnabled]);

  // 60 FPS Physics & Movement Loop
  useEffect(() => {
    if (!currentRoom) return undefined;
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

      // Smooth interpolation for remote avatars
      worldRef.current.remoteUsers = worldRef.current.remoteUsers.map((peer) =>
        interpolateRemoteAvatar(peer, dt, 10)
      );

      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [currentRoom, localAutoWalk, emitPositionUpdate]);

  // Throttled 10 Hz UI snapshot sync for sidebar
  useEffect(() => {
    if (!currentRoom) return undefined;
    const timer = setInterval(() => {
      setUiSnapshot({
        localUser: { ...worldRef.current.localUser },
        remoteUsers: worldRef.current.remoteUsers.map((u) => ({ ...u })),
      });
    }, 100);
    return () => clearInterval(timer);
  }, [currentRoom]);

  // Held-key listener for WASD and Arrows
  useEffect(() => {
    if (!currentRoom) return undefined;
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
  }, [currentRoom]);

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

  function handleExitOffice() {
    stopMicrophone();
    leaveOffice();
    setCurrentRoom(null);
    setChatMessages([]);
    worldRef.current.remoteUsers = [];
  }

  function handleLogout() {
    handleExitOffice();
    clearAuthData();
    setCurrentUser(null);
  }

  // Calculate nearby users within audioRadius (< 100px)
  const nearbyUsersCount = uiSnapshot.remoteUsers.filter((u) => {
    const dist = Math.hypot(
      (u.x || 0) - (uiSnapshot.localUser?.x || 0),
      (u.y || 0) - (uiSnapshot.localUser?.y || 0)
    );
    return dist <= audioRadius;
  }).length;

  // View 1: Not Authenticated -> Login / Register Screen
  if (!currentUser) {
    return <Login onAuthenticated={(user) => setCurrentUser(user)} />;
  }

  // View 2: Authenticated but Not in a Room -> Dashboard
  if (!currentRoom) {
    return (
      <Dashboard
        user={currentUser}
        onEnterRoom={(room) => setCurrentRoom(room)}
        onLogout={handleLogout}
      />
    );
  }

  // View 3: In Virtual Office
  return (
    <div className="office-shell">
      <OfficeHeader
        username={currentUser.username}
        roomName={currentRoom.name}
        roomId={currentRoom.roomId}
        connectionState={connectionState}
        memberCount={1 + uiSnapshot.remoteUsers.length}
        nearbyCount={nearbyUsersCount}
        onExitOffice={handleExitOffice}
        onLogout={handleLogout}
      />

      <main className="office-main-grid">
        {/* Left: Interactive Virtual Office Canvas */}
        <div className="canvas-stage-card">
          <OfficeCanvas
            worldRef={worldRef}
            audioRadius={audioRadius}
            speakerMuted={speakerMuted}
            onSelectLocalTarget={handleSelectLocalTarget}
          />
          <Toolbar
            localAutoWalk={localAutoWalk}
            onToggleLocalAutoWalk={() => setLocalAutoWalk((v) => !v)}
          />
        </div>

        {/* Right: Multi-tab Side Panel (Team Chat & Colleagues) + Audio Controls */}
        <aside className="office-sidebar">
          <div className="sidebar-tab-switcher">
            <button
              type="button"
              className={`sidebar-tab-btn ${activeSidebarTab === "chat" ? "active" : ""}`}
              onClick={() => {
                setActiveSidebarTab("chat");
                setUnreadChatCount(0);
              }}
            >
              <MessageSquare size={16} />
              <span>Team Chat</span>
              {unreadChatCount > 0 && (
                <span className="sidebar-tab-badge">{unreadChatCount}</span>
              )}
            </button>

            <button
              type="button"
              className={`sidebar-tab-btn ${activeSidebarTab === "users" ? "active" : ""}`}
              onClick={() => setActiveSidebarTab("users")}
            >
              <Users size={16} />
              <span>Colleagues</span>
              <span className="sidebar-tab-counter">
                {1 + uiSnapshot.remoteUsers.length}
              </span>
            </button>
          </div>

          <div className="sidebar-tab-content">
            {activeSidebarTab === "chat" ? (
              <TeamChat
                roomId={currentRoom.roomId}
                roomName={currentRoom.name}
                messages={chatMessages}
                onSendMessage={sendChatMessage}
                currentUsername={currentUser.username}
              />
            ) : (
              <UserList
                localUser={uiSnapshot.localUser}
                remoteUsers={uiSnapshot.remoteUsers}
                spatialMetrics={spatialMetrics}
              />
            )}
          </div>

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
