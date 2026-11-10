# Real-Time Signaling & Client Integration Guide

This document specifies the Socket.IO signaling layer protocol for ProxiSpeak, covering user presence, coordinate synchronization, proximity detection, WebRTC mesh signaling, chat, and interactive room state.

---

## 1. Connection & Session Setup

Once the client establishes a Socket.IO connection:

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:5000");

socket.on("connect", () => {
  console.log("Connected to ProxiSpeak signaling server with socket ID:", socket.id);

  // Join the virtual office room
  socket.emit("join-office", {
    username: "Alice",
    userId: "alice_123",
    roomId: "MAIN-OFFICE",
    color: "#818CF8",
    muted: false,
  });
});

// Server confirms session and assigns authoritative user state
socket.on("session-confirmed", (userState) => {
  console.log("Session confirmed:", userState);
});

// Full room participant list synchronization
socket.on("users-update", (participants) => {
  console.log("Current participants in room:", participants);
});

// A new colleague enters the room
socket.on("user-joined", (colleague) => {
  console.log("Colleague joined room:", colleague);
});

// A colleague leaves the room
socket.on("user-left", ({ id, userId }) => {
  console.log("Colleague left room:", id || userId);
});
```

---

## 2. Avatar Movement & Proximity Coordination

### Emitting Position Updates
When the local user navigates via click-to-move or WASD / Arrow keys:

```javascript
socket.emit("position-update", {
  x: Math.round(newX),
  y: Math.round(newY),
  direction: currentAngleRadians,
  muted: isMicrophoneMuted,
});
```

### Receiving Remote Movement
```javascript
// Dispatched to all other clients in the room
socket.on("user-moved", ({ id, userId, x, y, direction, muted }) => {
  // Update remote avatar's target coordinates for smooth client-side interpolation
});
```

---

## 3. WebRTC Mesh Signaling (P2P Perfect Negotiation)

The signaling layer acts as a transparent relay for WebRTC offers, answers, and ICE candidates between peers:

### A. SDP Offer Relay
```javascript
// Initiator emits offer to target peer
socket.emit("webrtc-offer", {
  targetId: peerSocketId,
  fromId: socket.id,
  sdp: peerConnection.localDescription,
});

// Target receives offer
socket.on("webrtc-offer", async ({ fromId, sdp }) => {
  await webrtcManager.handleIncomingOffer({ fromId, sdp });
});
```

### B. SDP Answer Relay
```javascript
// Target emits answer back to initiator
socket.emit("webrtc-answer", {
  targetId: fromId,
  fromId: socket.id,
  sdp: peerConnection.localDescription,
});

// Initiator receives answer
socket.on("webrtc-answer", async ({ fromId, sdp }) => {
  await webrtcManager.handleIncomingAnswer({ fromId, sdp });
});
```

### C. ICE Candidate Exchange
```javascript
// Emit discovered candidate
socket.emit("webrtc-ice-candidate", {
  targetId: peerSocketId,
  fromId: socket.id,
  candidate: event.candidate.toJSON(),
});

// Receive candidate
socket.on("webrtc-ice-candidate", async ({ fromId, candidate }) => {
  await webrtcManager.handleIncomingIceCandidate({ fromId, candidate });
});
```

### D. Video & Screen Share Media State
```javascript
// Broadcast video or screen share toggle
socket.emit("webrtc:media-state", {
  roomId: "MAIN-OFFICE",
  hasVideo: true,
  isSharingScreen: false,
  muted: false,
});

socket.on("webrtc:media-state", ({ userId, socketId, hasVideo, isSharingScreen, muted }) => {
  // Update colleague's camera and screen presentation tiles in VideoGrid
});
```

---

## 4. Collaborative Room Features

### A. Room Chat
```javascript
// Public message
socket.emit("chat:message", {
  roomId: "MAIN-OFFICE",
  text: "Hello everyone!",
  username: "Alice",
});

socket.on("chat:message", (messageObj) => {
  // Append to room chat history
});

// Message emoji reaction
socket.emit("chat:reaction", {
  messageId: "msg_123",
  roomId: "MAIN-OFFICE",
  emoji: "👍",
  username: "Alice",
});

socket.on("chat:reaction", ({ messageId, emoji, username, reactions }) => {
  // Update reaction counts
});
```

### B. 1-to-1 Direct Messaging
```javascript
socket.emit("chat:direct-message", {
  recipientId: "bob_456",
  recipientUsername: "Bob",
  text: "Hey Bob, quick question about the API",
  senderColor: "#818CF8",
});

socket.on("chat:direct-message", (dmObj) => {
  // Append to 1-to-1 conversation
});
```

### C. Hand Raising & Floating Reactions
```javascript
// Hand raise toggle
socket.emit("user:hand-raise", {
  roomId: "MAIN-OFFICE",
  raised: true,
});

socket.on("user:hand-raise", ({ userId, socketId, handRaised }) => {
  // Show/hide ✋ badge on avatar and user list
});

// Floating canvas emoji reaction
socket.emit("avatar:reaction", {
  roomId: "MAIN-OFFICE",
  emoji: "🎉",
});

socket.on("avatar:reaction", ({ userId, emoji, timestamp }) => {
  // Renders a floating bubble above the avatar on OfficeCanvas
});
```

---

## 5. Member 1 Proximity Signaling Compatibility

For backwards-compatibility with Member 1's test harnesses, the backend also supports:

- `avatar:register` with `{ userId }`
- `avatar:move` with `{ userId, x, y }`
- `proximity:peers:update`
- `proximity:peer:entered`
- `proximity:peer:left`
