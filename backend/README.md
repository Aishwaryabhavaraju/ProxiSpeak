# ProxiSpeak Geospatial Backend

This backend tracks avatar positions and answers proximity queries. It also provides Redis-backed Socket.IO signaling for WebRTC clients. MongoDB's planar `2d` index means `[x, y]`, distances, and radii are expressed in virtual-world units, not meters.

## Run

Requires Node.js 20+, MongoDB, and Redis.

```powershell
$env:MONGODB_URI = "mongodb://127.0.0.1:27017/proxispeak"
$env:REDIS_URL = "redis://127.0.0.1:6379"
npm install
npm start
```

The service listens on port `3000` by default; set `PORT` to change it. Every backend instance should use the same `REDIS_URL`. The Redis adapter is installed automatically at startup, and Redis connection failures prevent the service from starting rather than silently disabling cross-instance signaling.

To run two instances for a cross-instance signaling check, start one in each terminal with the same MongoDB and Redis URLs and different ports:

```powershell
# Terminal 1
$env:PORT = "3000"
npm start

# Terminal 2
$env:PORT = "3001"
npm start
```

Connect one Socket.IO client to each port, join both to the same `roomId`, then exchange the documented signaling events.

## API

- `PUT /api/avatars/:userId/location` with JSON `{ "x": 12, "y": 8 }` creates or updates an avatar.
- `GET /api/avatars/:userId/nearby?radius=5&limit=100` returns other avatars within the requested radius, ordered nearest first.
- `GET /api/avatars/within?x=12&y=8&radius=5&limit=100` returns avatars inside a circle using `$geoWithin`.
- `GET /health` reports service health.

Radius must be greater than `0` and at most `5000`; result limits range from `1` to `200`.

## WebRTC signaling and clients

Clients connect to the same Socket.IO endpoint on any backend instance:

- Emit `room:join` with `{ "roomId": "world-or-proximity-room" }`.
- Listen for `room:peers` (`{ peers: [socketId] }`), `peer:joined` and `peer:left` (`{ peerId }`).
- Relay `signal:offer`, `signal:answer`, and `signal:ice-candidate` as `{ to: socketId, data }`. The server validates that the target belongs to the sender's current room. Invalid payloads are reported through `signaling:error`.

The browser-side `src/client/peerMesh.js` module maintains at most one `RTCPeerConnection` per peer, selects the offerer deterministically from the Socket.IO IDs, buffers early ICE candidates, and exposes `setPeersInRange(peerIds)` to close connections once peers leave earshot. `src/client/distanceAudio.js` connects each remote `MediaStream` to a Web Audio `GainNode`; its default linear falloff reaches silence at 50 virtual-world units. Attach streams with `attach(peerId, stream)` and update gain with `setDistance(peerId, distance)`. Feed these modules the peer IDs and distances produced by the application's proximity/location updates.

Run the backend and client module tests with `npm test`. The signaling integration test uses a single Socket.IO server without Redis; validating cross-instance propagation requires two running backend instances connected to the same Redis service.