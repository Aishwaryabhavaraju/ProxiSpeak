# ProxiSpeak — Geospatial Proximity Audio Ecosystem

ProxiSpeak is a real-time, proximity-based spatial audio and virtual office collaboration ecosystem. Users navigate their avatars across a shared 2D canvas, and their voices dynamically attenuate and pan in stereo based on distance and relative angle—simulating natural conversations in physical spaces.

---

## Architecture & Technology Stack

- **Frontend**: React 18, Vite, HTML5 Canvas, Web Audio API, WebRTC P2P mesh
- **Backend**: Node.js, Express, Socket.IO, Redis Adapter (horizontal signaling scale)
- **Database**: MongoDB with planar `2d` index for flat virtual-world coordinates
- **Audio & Spatial Processing**:
  - Distance-based linear/exponential attenuation with smooth parameter ramps (Web Audio API)
  - Horizontal stereo panning (`StereoPannerNode`)
  - WebRTC Perfect Negotiation with collision rollback and ICE candidate serialization
- **State & Proximity Engine**:
  - High-performance in-memory `ProximityStateManager`
  - 100-pixel earshot detection with transition events (`enter` / `exit`)

---

## Team Contributions & Responsibilities

| Role | Responsibility | Key Deliverables |
| :--- | :--- | :--- |
| **Member 1: Backend & Core Services** | REST APIs & Scalable Signaling | Express application structure, avatar CRUD APIs, Redis-backed Socket.IO signaling adapter |
| **Member 2: Geospatial Engine & Scaling** | Proximity Algorithms & Real-time State | MongoDB `2d` planar geospatial index, 100px earshot logic, `ProximityStateManager`, transition tracking |
| **Member 3: Virtual Canvas & Room Flow** | Interactive Frontend Office & Room Management | HTML5 virtual office canvas, 60 FPS animation/movement loop, room creation and validation (`roomApi`) |
| **Member 4: WebRTC & Spatial Audio** | P2P Streaming & Audio Graph Pipeline | WebRTC peer connection lifecycle, collision rollback, dynamic gain/pan attenuation, microphone handling |

---

## Member 4: WebRTC Integration & Dynamic Spatial Attenuation

### 1. Microphone Capture
**File:** `frontend/src/hooks/useMicrophone.js`
- Captures microphone audio using browser `navigator.mediaDevices.getUserMedia()`.
- Configured for mono input (`channelCount: 1`), echo cancellation, and automatic gain control.
- Explicit error handling for permissions, hardware errors, and secure context requirements.

### 2. WebRTC Peer Connections & Perfect Negotiation
**File:** `frontend/src/services/webrtc.js`
- Implements `WebRTCManager` managing `RTCPeerConnection` lifecycles.
- Applies the **Perfect Negotiation** pattern with rollback on offer collisions:
  - Polite peer rolls back local offer if a collision occurs.
  - Candidate serialization with `.toJSON()` support and queued candidate flushing.
  - Automatic ICE restart on failed ICE connection states.
  - Environmental STUN/TURN server configuration via `VITE_ICE_SERVERS`.

### 3. Dynamic Web Audio API Graph
**File:** `frontend/src/services/audioEngine.js`
- Web Audio API pipeline:
  `MediaStreamAudioSourceNode` → `GainNode` → `StereoPannerNode` → `AudioDestinationNode`
- **Volume Attenuation:** `gain = max(0, 1 - distance / earshotRadius)` (100px earshot).
- **Stereo Panning:** `pan = clamp(-1, 1, (remote.x - local.x) / earshotRadius)`.
- **Smooth Parameter Transitions:** 40ms exponential time constant (`setTargetAtTime`) prevents zipper noise, clicking, or mid-sentence syllable truncation at 60 FPS.
- Chromium keep-alive mechanism to prevent decoder throttling on remote WebRTC audio streams.

---

## Getting Started

### Prerequisites
- Node.js 20+
- MongoDB instance (local or MongoDB Atlas)
- Redis instance (optional, for cross-instance horizontal signaling)

### Backend Setup
```bash
cd backend
npm install
npm test
npm start
```

### Frontend Setup
```bash
cd frontend
npm install
npm test
npm run dev
```

---

## Testing

- **Backend Proximity & Geospatial Tests**:
  `cd backend && npm test`
  Verifies 2D index, multi-user proximity, earshot detection, enter/exit transitions, and WebRTC relay.
- **Frontend Spatial Audio Unit Tests**:
  `cd frontend && npm test`
  Verifies Euclidean distance calculations, volume attenuation, stereo panning, and hysteresis boundaries.
