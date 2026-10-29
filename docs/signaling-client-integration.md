# Signaling Client Integration Guide (Member 1 Integration)

This document provides the integration guide and client-side listeners for Member 1 (WebRTC signaling layer) to interact with the proximity-based audio system.

---

## 1. Register User Socket on Connect

Once the client establishes a Socket.IO connection, register the authenticated user's ID with the server. This maps the `userId` to the active `socket.id` in `userSockets`:

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:5000");

socket.on("connect", () => {
  console.log("Connected to ProxiSpeak server with socket ID:", socket.id);

  // Register the current authenticated user
  socket.emit("avatar:register", {
    userId: currentUserId, // Replace with the authenticated user's actual ID
  });
});

socket.on("avatar:registered", ({ success, userId }) => {
  console.log(`User ${userId} successfully registered for proximity signaling.`);
});
```

---

## 2. Listen for Proximity Signaling Events

Register these listeners **once** (e.g. during application setup or hook mounting), not each time the avatar moves.

### A. Reconcile Peer List (`proximity:peers:update`)
Emitted to the moving user with the complete list of all currently eligible nearby peers within earshot (`EARSHOT_RADIUS = 100px`).

```javascript
socket.on("proximity:peers:update", ({ userId, radius, peers }) => {
  console.log("Eligible peers:", peers);

  // Member 1: Reconcile WebRTC peer connections against this complete peer list.
  // Each peer object contains:
  // {
  //   userId: string,
  //   username: string,
  //   position: [number, number],
  //   distance: number,
  //   canHear: boolean
  // }
});
```

### B. Peer Enters Earshot (`proximity:peer:entered`)
Emitted to **both** the moving user and the nearby peer when they enter earshot.

```javascript
socket.on("proximity:peer:entered", ({ userId, peer }) => {
  console.log(`${peer.userId} (${peer.username}) entered earshot of ${userId} at distance ${peer.distance}px`);

  // Member 1: Initiate or coordinate WebRTC offer/answer negotiation with `peer.userId`.
  // peer: { userId, username, position, distance }
});
```

### C. Peer Leaves Earshot (`proximity:peer:left`)
Emitted to **both** users when they move outside earshot radius.

```javascript
socket.on("proximity:peer:left", ({ userId, peerUserId }) => {
  console.log(`${peerUserId} left earshot of ${userId}`);

  // Member 1: Close, mute, or clean up the corresponding WebRTC audio connection.
});
```

---

## 3. Movement Emission

When the local user moves their avatar:

```javascript
socket.emit("avatar:move", {
  userId: currentUserId,
  x: newX,
  y: newY,
});
```
