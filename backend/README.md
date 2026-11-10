# ProxiSpeak — Backend Service

The ProxiSpeak backend provides REST APIs, MongoDB persistence, and Socket.IO real-time signaling for 2D avatar movement, WebRTC peer audio/video mesh negotiation, spatial proximity tracking, team chat, and meeting scheduling.

---

## 🛠️ Architecture Overview

- **Port**: `5000` (configurable via `PORT` environment variable).
- **Database**: MongoDB with planar `2d` index for coordinate queries (`Avatar.position: "2d"`).
- **Real-Time Engine**: Socket.IO server with support for Redis adapter scaling.
- **Fault-Tolerant Resiliency**: If MongoDB Atlas cluster is unreachable (e.g. IP whitelist block), the server switches to in-memory fallback mode rather than crashing, keeping all APIs and real-time signaling active.

---

## 📡 REST API Reference

### 1. Authentication (`/api/auth`)
- `POST /api/auth/register` — Register a new account `{ username, password, avatarColor }`.
- `POST /api/auth/login` — Authenticate and receive JWT `{ username, password }`.
- `GET /api/auth/me` — Retrieve profile of currently authenticated user (`Authorization: Bearer <token>`).

### 2. Room Management (`/api/rooms`)
- `GET /api/rooms` — List all active office rooms.
- `POST /api/rooms` — Create a new room `{ roomId, name, description, maxCapacity }`.
- `GET /api/rooms/validate/:code` — Validate room existence.

### 3. Avatar Geospatial Coordinates (`/api/avatars`)
- `GET /api/avatars` — Retrieve all online avatars.
- `PUT /api/avatars/:userId/location` — Create or update avatar location `{ x, y, username }`.
- `PATCH /api/avatars/:userId/position` — Update existing coordinates `{ x, y }`.
- `GET /api/avatars/:userId/nearby?radius=100&limit=100` — Retrieve users within proximity radius.
- `GET /api/avatars/near?x=200&y=200&radius=100` — Planar circular radius search.
- `GET /api/avatars/within?minX=10&minY=10&maxX=500&maxY=400` — Rectangular bounding box query.
- `GET /api/avatars/nearest/:userId` — Nearest avatars ordered by distance.
- `GET /api/avatars/earshot/:userId` — Avatars within the standard 100px earshot boundary.
- `GET /api/avatars/proximity-groups` — Generates proximity audio clusters for all online avatars.

### 4. Office Layouts (`/api/office-layouts`)
- `POST /api/office-layouts` — Create persistent room layout `{ roomId, roomName, dimensions, furniture }`.
- `GET /api/office-layouts/:roomId` — Retrieve office layout with furniture obstacles.
- `PUT /api/office-layouts/:roomId` — Update entire room layout.
- `POST /api/office-layouts/:roomId/furniture` — Add obstacle subdocument `{ name, type, x, y, width, height, blocksAudio }`.
- `PATCH /api/office-layouts/:roomId/furniture/:furnitureId` — Update obstacle.
- `DELETE /api/office-layouts/:roomId/furniture/:furnitureId` — Remove obstacle.

### 5. Team Chat (`/api/chat`)
- `POST /api/chat/message` — Send message `{ roomId, text, username }`.
- `GET /api/chat/room/:roomId` — Retrieve room message history.
- `GET /api/chat/direct/:userA/:userB` — Retrieve 1-to-1 direct message history.

### 6. Meeting Scheduling (`/api/meetings`)
- `POST /api/meetings` — Schedule meeting `{ title, description, date, startTime, endTime, roomId }`.
- `GET /api/meetings/upcoming` — Retrieve upcoming scheduled meetings.
- `GET /api/meetings/:id` — Retrieve meeting details by ID.
- `DELETE /api/meetings/:id` — Cancel a scheduled meeting.

---

## ⚡ Socket.IO Real-Time Events

| Event Name | Direction | Payload | Description |
| :--- | :--- | :--- | :--- |
| `join-office` | Client → Server | `{ username, userId, roomId, color, muted }` | Join virtual office room |
| `session-confirmed` | Server → Client | `userState` | Server confirmation of joined session |
| `users-update` | Server → Client | `[userState, ...]` | Synchronizes all peers currently in room |
| `position-update` | Client → Server | `{ x, y, direction, muted }` | Local avatar coordinate updates |
| `user-moved` | Server → Broadcast | `{ id, userId, x, y, direction, muted }` | Dispatched to peers in room |
| `avatar:moved` | Server → Broadcast | `{ userId, position: [x, y] }` | Planar coordinate sync |
| `webrtc-offer` | Bidirectional Relay | `{ targetId, fromId, sdp }` | Relays WebRTC SDP offer |
| `webrtc-answer` | Bidirectional Relay | `{ targetId, fromId, sdp }` | Relays WebRTC SDP answer |
| `webrtc-ice-candidate`| Bidirectional Relay | `{ targetId, fromId, candidate }` | Relays ICE candidates |
| `webrtc:media-state` | Bidirectional Relay | `{ hasVideo, isSharingScreen, muted }` | Video / screen share state |
| `user:hand-raise` | Bidirectional Relay | `{ userId, handRaised }` | Toggles hand raise status |
| `avatar:reaction` | Bidirectional Relay | `{ userId, emoji, timestamp }` | Floating emoji above avatar |
| `chat:message` | Bidirectional Relay | `{ roomId, text, username }` | Public room channel message |
| `chat:direct-message` | Bidirectional Relay | `{ recipientId, text, ... }` | Private 1-to-1 direct message |
| `spatial:audio:update` | Server → Client | `{ remoteId, distance, gain, pan, isObstructed }` | Distance and obstruction calculation |

---

## 🧪 Testing

Run all 10 backend test suites (26 unit tests):

```powershell
node --test test/officeLayoutRoutes.test.js test/soundObstructionAndSpatial.test.js test/chatAndMeetingRoutes.test.js test/audioRoutingService.test.js test/authAndRoom.test.js test/proximityTracker.test.js test/webrtcRelay.test.js test/day27Validation.test.js test/proximity.test.js
```
