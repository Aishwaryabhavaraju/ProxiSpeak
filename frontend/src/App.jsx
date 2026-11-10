import React, { useState, useEffect, useRef, useCallback } from "react";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import OfficeHeader from "./components/OfficeHeader";
import OfficeCanvas from "./components/OfficeCanvas";
import UserList from "./components/UserList";
import TeamChat from "./components/TeamChat";
import DirectMessages from "./components/DirectMessages";
import VideoGrid from "./components/VideoGrid";
import MeetingModal from "./components/MeetingModal";
import AudioControls from "./components/AudioControls";
import Toolbar from "./components/Toolbar";
import { MessageSquare, Users, MessageCircle } from "lucide-react";
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
import { audioEngine } from "./services/audioEngine";
import { webrtcManager } from "./services/webrtc";
import { getStoredUser, clearAuthData } from "./services/authApi";
import "./styles/Office.css";

export default function App() {
  // Authentication & Workspace State Machine
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [currentRoom, setCurrentRoom] = useState(null); // { roomId, name, description }
  const [activeSidebarTab, setActiveSidebarTab] = useState("chat"); // "chat" | "direct" | "users"
  const [chatMessages, setChatMessages] = useState([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Direct Messaging States
  const [directMessages, setDirectMessages] = useState([]);
  const [unreadDmCounts, setUnreadDmCounts] = useState({});

  // Video & Screen Sharing States
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [localScreenTrack, setLocalScreenTrack] = useState(null);
  const [remoteVideoStreams, setRemoteVideoStreams] = useState({});

  // Hand Raise & Avatar Reactions
  const [handRaised, setHandRaised] = useState(false);
  const [avatarReactions, setAvatarReactions] = useState([]);

  // Audio Controls & PTT States
  const [audioRadius, setAudioRadius] = useState(OFFICE_CONFIG.defaultAudioRadius);
  const [masterVolume, setMasterVolume] = useState(100);
  const [peerVolumes, setPeerVolumes] = useState({});
  const [isPushToTalk, setIsPushToTalk] = useState(false);
  const [localAutoWalk, setLocalAutoWalk] = useState(false);

  // Meeting Scheduler Modal State
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);

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
      handRaised: false,
      hasVideo: false,
      isSharingScreen: false,
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

  // Clean expired floating avatar reactions every 1 second
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setAvatarReactions((prev) => prev.filter((r) => now - r.timestamp < 2600));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
          handRaised: Boolean(u.handRaised),
          hasVideo: Boolean(u.hasVideo),
          isSharingScreen: Boolean(u.isSharingScreen),
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
          handRaised: Boolean(newUser.handRaised),
          hasVideo: Boolean(newUser.hasVideo),
          isSharingScreen: Boolean(newUser.isSharingScreen),
          isBot: false,
        },
      ];
    }
  }, []);

  const handleUserLeft = useCallback((leftId) => {
    worldRef.current.remoteUsers = worldRef.current.remoteUsers.filter(
      (u) => u.id !== leftId && u.userId !== leftId
    );
    setRemoteVideoStreams((prev) => {
      const next = { ...prev };
      delete next[leftId];
      return next;
    });
  }, []);

  const handleChatMessage = useCallback((msg) => {
    setChatMessages((prev) => [...prev, msg]);
    setActiveSidebarTab((currentTab) => {
      if (currentTab !== "chat") {
        setUnreadChatCount((count) => count + 1);
      }
      return currentTab;
    });
  }, []);

  const handleChatReaction = useCallback((data) => {
    setChatMessages((prev) =>
      prev.map((m) =>
        (m.id === data.messageId || m.messageId === data.messageId)
          ? { ...m, reactions: data.reactions }
          : m
      )
    );
  }, []);

  const handleDirectMessage = useCallback((msg) => {
    setDirectMessages((prev) => [...prev, msg]);
    const sender = msg.senderId || msg.senderUsername;
    setActiveSidebarTab((currentTab) => {
      if (currentTab !== "direct") {
        setUnreadDmCounts((prev) => ({
          ...prev,
          [sender]: (prev[sender] || 0) + 1,
        }));
      }
      return currentTab;
    });
  }, []);

  const handleHandRaise = useCallback((data) => {
    const { userId, handRaised: raised } = data;
    worldRef.current.remoteUsers = worldRef.current.remoteUsers.map((u) =>
      u.userId === userId || u.id === userId ? { ...u, handRaised: raised } : u
    );
  }, []);

  const handleAvatarReaction = useCallback((data) => {
    const rx = {
      id: Math.random().toString(36).slice(2, 9),
      userId: data.userId,
      emoji: data.emoji,
      timestamp: data.timestamp || Date.now(),
    };
    setAvatarReactions((prev) => [...prev, rx]);
  }, []);

  const handleMediaState = useCallback((data) => {
    const { userId, hasVideo: video, isSharingScreen: screen, muted: isMuted } = data;
    worldRef.current.remoteUsers = worldRef.current.remoteUsers.map((u) =>
      u.userId === userId || u.id === userId
        ? {
            ...u,
            hasVideo: video !== undefined ? video : u.hasVideo,
            isSharingScreen: screen !== undefined ? screen : u.isSharingScreen,
            muted: isMuted !== undefined ? isMuted : u.muted,
          }
        : u
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
    sendChatReaction,
    sendDirectMessage,
    emitHandRaise,
    emitAvatarReaction,
    emitMediaState,
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
    onChatReaction: handleChatReaction,
    onDirectMessage: handleDirectMessage,
    onHandRaise: handleHandRaise,
    onAvatarReaction: handleAvatarReaction,
    onMediaState: handleMediaState,
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

  // WebRTC remote video hook initialization
  useEffect(() => {
    webrtcManager.onRemoteVideoTrack = (peerId, track, stream) => {
      const peer = worldRef.current.remoteUsers.find((u) => u.id === peerId || u.userId === peerId);
      setRemoteVideoStreams((prev) => ({
        ...prev,
        [peerId]: {
          stream,
          username: peer?.username || peerId,
          isMuted: peer?.muted || false,
          isScreen: track.label?.toLowerCase().includes("screen") || false,
        },
      }));
    };

    webrtcManager.onRemoteVideoTrackEnded = (peerId) => {
      setRemoteVideoStreams((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    };
  }, []);

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

  // Master Volume adjustments
  const handleMasterVolumeChange = useCallback((vol) => {
    setMasterVolume(vol);
    audioEngine.setMasterVolume(vol / 100);
  }, []);

  // Individual Peer Volume adjustments
  const handlePeerVolumeChange = useCallback((peerId, vol) => {
    setPeerVolumes((prev) => ({ ...prev, [peerId]: vol }));
    audioEngine.setPeerVolume(peerId, vol);
  }, []);

  // Push-to-Talk Keyboard Spacebar Handling (with typing avoidance)
  useEffect(() => {
    if (!isPushToTalk || !micEnabled) return undefined;

    function isUserTyping() {
      const tag = document.activeElement?.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || document.activeElement?.isContentEditable;
    }

    function handleKeyDown(e) {
      if (e.code === "Space" && !isUserTyping() && !e.repeat) {
        e.preventDefault();
        if (micMuted) {
          toggleMicMute();
        }
      }
    }

    function handleKeyUp(e) {
      if (e.code === "Space" && !isUserTyping()) {
        e.preventDefault();
        if (!micMuted) {
          toggleMicMute();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isPushToTalk, micEnabled, micMuted, toggleMicMute]);

  // Camera Toggle
  const handleToggleVideo = async () => {
    if (videoEnabled) {
      if (localVideoTrack) {
        localVideoTrack.stop();
        setLocalVideoTrack(null);
        webrtcManager.setLocalVideoTrack(null);
      }
      setVideoEnabled(false);
      worldRef.current.localUser.hasVideo = false;
      emitMediaState({ hasVideo: false });
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 480, height: 360, frameRate: 24 },
        });
        const track = stream.getVideoTracks()[0];
        setLocalVideoTrack(track);
        webrtcManager.setLocalVideoTrack(track);
        setVideoEnabled(true);
        worldRef.current.localUser.hasVideo = true;
        emitMediaState({ hasVideo: true });
      } catch (err) {
        console.warn("Camera access denied or failed:", err.message);
      }
    }
  };

  // Screen Share Toggle
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      if (localScreenTrack) {
        localScreenTrack.stop();
        setLocalScreenTrack(null);
        webrtcManager.setScreenShareTrack(null);
      }
      setIsScreenSharing(false);
      worldRef.current.localUser.isSharingScreen = false;
      emitMediaState({ isSharingScreen: false });
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        const track = stream.getVideoTracks()[0];
        track.onended = () => {
          setIsScreenSharing(false);
          setLocalScreenTrack(null);
          webrtcManager.setScreenShareTrack(null);
          worldRef.current.localUser.isSharingScreen = false;
          emitMediaState({ isSharingScreen: false });
        };
        setLocalScreenTrack(track);
        webrtcManager.setScreenShareTrack(track);
        setIsScreenSharing(true);
        worldRef.current.localUser.isSharingScreen = true;
        emitMediaState({ isSharingScreen: true });
      } catch (err) {
        console.warn("Screen share cancelled or failed:", err.message);
      }
    }
  };

  // Hand Raise Toggle
  const handleToggleHandRaise = () => {
    const next = !handRaised;
    setHandRaised(next);
    worldRef.current.localUser.handRaised = next;
    emitHandRaise(next);
  };

  // Avatar Reaction Dispatch
  const handleSendAvatarReaction = (emoji) => {
    const rx = {
      id: Math.random().toString(36).slice(2, 9),
      userId: currentUser?.username || worldRef.current.localUser.id,
      emoji,
      timestamp: Date.now(),
    };
    setAvatarReactions((prev) => [...prev, rx]);
    emitAvatarReaction(emoji);
  };

  // 60 FPS Physics & Movement Loop
  useEffect(() => {
    if (!currentRoom) return undefined;
    let lastTime = performance.now();
    let frameId;

    function tick(now) {
      const dt = Math.min(Math.max((now - lastTime) / 1000, 0.001), 0.1);
      lastTime = now;

      // Local Avatar movement
      const local = worldRef.current.localUser;
      if (local) {
        let moved = false;
        let newX = local.x;
        let newY = local.y;
        let dir = local.direction;

        // Auto-walk circuit mode
        if (localAutoWalk) {
          const t = now / 3000;
          const targetX = 500 + Math.sin(t) * 180;
          const targetY = 320 + Math.cos(t) * 120;
          const dx = targetX - local.x;
          const dy = targetY - local.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 2) {
            const speed = 140;
            const step = Math.min(dist, speed * dt);
            const angle = Math.atan2(dy, dx);
            const stepX = Math.cos(angle) * step;
            const stepY = Math.sin(angle) * step;
            const slide = moveWithSliding(local.x, local.y, stepX, stepY);
            newX = slide.x;
            newY = slide.y;
            dir = angle;
            moved = true;
          }
        } else {
          // Keyboard controls (WASD & Arrow keys)
          let kx = 0;
          let ky = 0;
          if (keysPressedRef.current.has("KeyW") || keysPressedRef.current.has("ArrowUp")) ky -= 1;
          if (keysPressedRef.current.has("KeyS") || keysPressedRef.current.has("ArrowDown")) ky += 1;
          if (keysPressedRef.current.has("KeyA") || keysPressedRef.current.has("ArrowLeft")) kx -= 1;
          if (keysPressedRef.current.has("KeyD") || keysPressedRef.current.has("ArrowRight")) kx += 1;

          if (kx !== 0 || ky !== 0) {
            const mag = Math.hypot(kx, ky);
            const speed = 160;
            const stepX = (kx / mag) * speed * dt;
            const stepY = (ky / mag) * speed * dt;
            const slide = moveWithSliding(local.x, local.y, stepX, stepY);
            if (!slide.blocked) {
              newX = slide.x;
              newY = slide.y;
              dir = Math.atan2(ky, kx);
              moved = true;
            }
            local.targetX = null;
            local.targetY = null;
          } else if (
            typeof local.targetX === "number" &&
            typeof local.targetY === "number"
          ) {
            // Target click movement toward clicked coordinates
            const dx = local.targetX - local.x;
            const dy = local.targetY - local.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 3) {
              const speed = 160;
              const step = Math.min(dist, speed * dt);
              const angle = Math.atan2(dy, dx);
              const stepX = Math.cos(angle) * step;
              const stepY = Math.sin(angle) * step;
              const slide = moveWithSliding(local.x, local.y, stepX, stepY);

              if (slide.blocked || (slide.x === local.x && slide.y === local.y)) {
                // If blocked by obstacle, smoothly stop and clear target
                local.targetX = null;
                local.targetY = null;
              } else {
                newX = slide.x;
                newY = slide.y;
                dir = angle;
                moved = true;
              }
            } else {
              // Reached target destination cleanly
              newX = local.targetX;
              newY = local.targetY;
              local.targetX = null;
              local.targetY = null;
              moved = true;
            }
          }
        }

        if (moved) {
          local.x = newX;
          local.y = newY;
          local.direction = dir;
          emitPositionUpdate(newX, newY, dir, local.muted);
        }
      }

      // Interpolate remote avatars toward server positions
      for (const peer of worldRef.current.remoteUsers) {
        if (typeof peer.serverX === "number" && typeof peer.serverY === "number") {
          const interp = interpolateRemoteAvatar(peer, dt, 10);
          peer.x = interp.x;
          peer.y = interp.y;
          if (typeof interp.direction === "number") {
            peer.direction = interp.direction;
          }
        }
      }

      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);

    function handleKeyDown(e) {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (["KeyW", "KeyS", "KeyA", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
        keysPressedRef.current.add(e.code);
      }
    }

    function handleKeyUp(e) {
      keysPressedRef.current.delete(e.code);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [currentRoom, localAutoWalk, emitPositionUpdate]);

  // 10 Hz UI sync
  useEffect(() => {
    if (!currentRoom) return undefined;
    const interval = setInterval(() => {
      setUiSnapshot({
        localUser: { ...worldRef.current.localUser },
        remoteUsers: [...worldRef.current.remoteUsers],
      });
    }, 100);
    return () => clearInterval(interval);
  }, [currentRoom]);

  function handleSelectLocalTarget({ x, y }) {
    setLocalAutoWalk(false);
    if (worldRef.current.localUser && typeof x === "number" && typeof y === "number") {
      const minX = 28;
      const maxX = OFFICE_CONFIG.width - 28;
      const minY = 28;
      const maxY = OFFICE_CONFIG.height - 28;
      const clampedX = Math.max(minX, Math.min(maxX, x));
      const clampedY = Math.max(minY, Math.min(maxY, y));
      worldRef.current.localUser.targetX = clampedX;
      worldRef.current.localUser.targetY = clampedY;
    }
  }

  function handleExitOffice() {
    if (localVideoTrack) {
      localVideoTrack.stop();
      setLocalVideoTrack(null);
    }
    if (localScreenTrack) {
      localScreenTrack.stop();
      setLocalScreenTrack(null);
    }
    setVideoEnabled(false);
    setIsScreenSharing(false);
    setRemoteVideoStreams({});
    setHandRaised(false);
    stopMicrophone();
    leaveOffice();
    setCurrentRoom(null);
    setChatMessages([]);
    setDirectMessages([]);
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

  const totalUnreadDms = Object.values(unreadDmCounts).reduce((a, b) => a + b, 0);

  // View 1: Not Authenticated -> Login / Register Screen
  if (!currentUser) {
    return <Login onAuthenticated={(user) => setCurrentUser(user)} />;
  }

  // View 2: Authenticated but Not in a Room -> Dashboard
  if (!currentRoom) {
    return (
      <>
        <Dashboard
          user={currentUser}
          onEnterRoom={(room) => setCurrentRoom(room)}
          onLogout={handleLogout}
          onOpenScheduler={() => setIsMeetingModalOpen(true)}
        />
        <MeetingModal
          isOpen={isMeetingModalOpen}
          onClose={() => setIsMeetingModalOpen(false)}
          currentRoomId="MAIN-OFFICE"
          currentUser={currentUser}
          onJoinRoom={(room) => setCurrentRoom(room)}
        />
      </>
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
        onOpenScheduler={() => setIsMeetingModalOpen(true)}
      />

      <main className="office-main-grid">
        {/* Left: Video Stage + Interactive Virtual Office Canvas */}
        <div className="canvas-stage-card">
          <VideoGrid
            localVideoTrack={localVideoTrack}
            localScreenTrack={localScreenTrack}
            remoteVideoStreams={remoteVideoStreams}
            currentUsername={currentUser.username}
            localMuted={micMuted || !micEnabled}
            isScreenSharing={isScreenSharing}
            onStopScreenShare={handleToggleScreenShare}
          />

          <OfficeCanvas
            worldRef={worldRef}
            audioRadius={audioRadius}
            speakerMuted={speakerMuted}
            onSelectLocalTarget={handleSelectLocalTarget}
            avatarReactions={avatarReactions}
          />

          <Toolbar
            localAutoWalk={localAutoWalk}
            onToggleLocalAutoWalk={() => setLocalAutoWalk((v) => !v)}
            videoEnabled={videoEnabled}
            onToggleVideo={handleToggleVideo}
            isScreenSharing={isScreenSharing}
            onToggleScreenShare={handleToggleScreenShare}
            handRaised={handRaised}
            onToggleHandRaise={handleToggleHandRaise}
            onSendAvatarReaction={handleSendAvatarReaction}
            onOpenScheduler={() => setIsMeetingModalOpen(true)}
          />
        </div>

        {/* Right: Multi-tab Side Panel (Team Chat, Direct Messages, Colleagues) + Audio Controls */}
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
              <span>Room Chat</span>
              {unreadChatCount > 0 && (
                <span className="sidebar-tab-badge">{unreadChatCount}</span>
              )}
            </button>

            <button
              type="button"
              className={`sidebar-tab-btn ${activeSidebarTab === "direct" ? "active" : ""}`}
              onClick={() => setActiveSidebarTab("direct")}
            >
              <MessageCircle size={16} />
              <span>Direct</span>
              {totalUnreadDms > 0 && (
                <span className="sidebar-tab-badge dm-badge">{totalUnreadDms}</span>
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
                onSendReaction={sendChatReaction}
                currentUsername={currentUser.username}
              />
            ) : activeSidebarTab === "direct" ? (
              <DirectMessages
                currentUsername={currentUser.username}
                colleagues={uiSnapshot.remoteUsers}
                directMessages={directMessages}
                onSendDirectMessage={sendDirectMessage}
                unreadCounts={unreadDmCounts}
                onClearUnread={(id) =>
                  setUnreadDmCounts((prev) => ({ ...prev, [id]: 0 }))
                }
              />
            ) : (
              <UserList
                localUser={uiSnapshot.localUser}
                remoteUsers={uiSnapshot.remoteUsers}
                spatialMetrics={spatialMetrics}
                onSelectDM={(colleague) => {
                  setActiveSidebarTab("direct");
                }}
                onPeerVolumeChange={handlePeerVolumeChange}
                peerVolumes={peerVolumes}
              />
            )}
          </div>

          <AudioControls
            micEnabled={micEnabled}
            micMuted={micMuted}
            speakerMuted={speakerMuted}
            micError={micError}
            audioRadius={audioRadius}
            masterVolume={masterVolume}
            isPushToTalk={isPushToTalk}
            onEnableMic={enableMicrophone}
            onToggleMicMute={toggleMicMute}
            onToggleSpeakerMute={toggleSpeakerMute}
            onChangeRadius={setAudioRadius}
            onChangeMasterVolume={handleMasterVolumeChange}
            onTogglePushToTalk={() => setIsPushToTalk((v) => !v)}
            onPttMouseDown={() => {
              if (micMuted) toggleMicMute();
            }}
            onPttMouseUp={() => {
              if (!micMuted) toggleMicMute();
            }}
          />
        </aside>
      </main>

      {/* Meeting Scheduler Dialog */}
      <MeetingModal
        isOpen={isMeetingModalOpen}
        onClose={() => setIsMeetingModalOpen(false)}
        currentRoomId={currentRoom?.roomId || "MAIN-OFFICE"}
        currentUser={currentUser}
        onJoinRoom={(room) => setCurrentRoom(room)}
      />
    </div>
  );
}
