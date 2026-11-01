# ProxiSpeak

> **Geospatial Proximity Voice Collaboration Platform**  
> Real-time 2D virtual office with true 3D spatial audio, WebRTC full-mesh voice communication, interactive canvas navigation, and live telemetry diagnostics.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [What Has Been Built (Complete Project Scope)](#what-has-been-built-complete-project-scope)
- [Architecture & Audio Pipeline](#architecture--audio-pipeline)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
  - [1. Backend Setup](#1-backend-setup)
  - [2. Frontend Setup](#2-frontend-setup)
- [Environment Variables](#environment-variables)
- [Controls & Usage](#controls--usage)
- [Testing & Verification](#testing--verification)
- [WebRTC & Audio Engineering Highlights](#webrtc--audio-engineering-highlights)
- [Diagnostics Panel](#diagnostics-panel)
- [Troubleshooting](#troubleshooting)

---

## Overview

**ProxiSpeak** turns remote communication into an organic, spatial experience. Users navigate avatars across an interactive 2D office canvas where voice volume and stereo direction are determined by physical proximity and orientation:

- **Closer avatars** sound louder and clearer.
- **Farther avatars** fade smoothly into silence beyond the communication radius.
- **Left/Right positioning** pans binaural audio across headphones using the Web Audio API's Head-Related Transfer Function (**HRTF**).
- **Direct P2P audio**: Voice streams never touch the backend server—audio travels peer-to-peer over encrypted WebRTC channels with in-band forward error correction (FEC) and low-latency Opus encoding.

---

## Key Features

- **True 3D Spatial Audio**: Web Audio API `AudioListener` + per-peer `PannerNode` (HRTF) and `GainNode` with 40ms exponential smoothing (`setTargetAtTime`).
- **Enterprise WebRTC Full-Mesh**: W3C Perfect Negotiation pattern with deterministic polite/impolite glare resolution, trickle ICE candidate queuing, and instant mic track replacement (`replaceTrack`) with zero renegotiation lag.
- **Uninterrupted Speech Transmission**: Optimized Opus SDP (`usedtx=0;useinbandfec=1;ptime=20;maxaveragebitrate=64000;stereo=0`) eliminates voice breaking, mid-sentence stutter, and word cutoff near the end of utterances.
- **2D Interactive Canvas Office**: Custom 60 FPS rendering engine with collision detection around desks, walls, and meeting tables, smooth keyboard/mouse navigation, and direction indicator dots.
- **Real-Time Telemetry & Diagnostics**: In-app developer panel displaying live metrics from `RTCPeerConnection.getStats()`: RTT, jitter, packet loss, incoming bitrate, jitter buffer delay, codec, and candidate connection types.
- **In-Office Team Chat**: Integrated text messaging with unread badge counters and persistent room history.
- **Graceful Resilience**: In-memory signaling fallback when MongoDB is offline, automatic AudioContext unlock/resume, and Chromium keep-alive pipelines.

---

## What Has Been Built (Complete Project Scope)

The ProxiSpeak platform consists of 6 integrated engineering modules:

### 1. 3D Web Audio Spatial Engine (`frontend/frontend/src/services/audioEngine.js`)
- **HRTF Panning**: Transforms 2D canvas coordinates $(x, y)$ into 3D audio listener/source coordinates $(x, 0, z)$ using the Web Audio API's Head-Related Transfer Function.
- **Individual Per-Peer Graph**: Every connected colleague receives their own isolated pipeline (`MediaStreamAudioSourceNode` → `GainNode` → `PannerNode` → `Destination`). Movement of one user never affects another.
- **Distance Attenuation**: Implements smooth linear volume rolloff ($gain = \max(0, 1 - distance / radius)$) with cutoff outside the listening radius.
- **Click & Glitch Free**: Uses 40ms exponential smoothing (`setTargetAtTime`) and avoids scheduling parameter updates when avatars are stationary.

### 2. Enterprise Multi-User WebRTC Engine (`frontend/frontend/src/services/webrtc.js`)
- **Full-Mesh P2P Audio**: Audio travels directly peer-to-peer with no audio routed through the backend.
- **W3C Perfect Negotiation**: Polite/impolite glare handling guarantees reliable two-way negotiation even when multiple users join simultaneously.
- **Zero-Lag Mic Swapping**: Calling `setLocalStream()` switches active microphone tracks across all peers using `replaceTrack()` with 0ms renegotiation overhead.
- **Opus Codec Optimization**: Injects `usedtx=0;useinbandfec=1;ptime=20;maxaveragebitrate=64000;stereo=0` to guarantee uninterrupted speech without sentence-ending cutoffs.

### 3. Interactive 2D Office Canvas (`frontend/frontend/src/components/OfficeCanvas.jsx`)
- **60 FPS Rendering Loop**: Renders office floors, conference rooms, desks, chairs, and colored user avatars with smooth interpolation.
- **Collision Detection (`movement.js`)**: Real-time bounding box collision detection against office walls and furniture.
- **Flexible Navigation**: Supports keyboard (`WASD`, arrow keys) and mouse click-to-move pathing.

### 4. Signaling & Room Coordination Server (`backend/src/socketServer.js`)
- **Directed WebRTC Signaling**: Routes SDP offers, answers, and trickle ICE candidates strictly between the intended sender and receiver.
- **Room State & Presence**: Tracks user coordinates, room membership, and microphone mute status (throttled to 20 Hz).
- **Dual Persistence Architecture**: Backed by MongoDB atomic models (`Participant`, `Avatar`, `Room`) with seamless fallback to fast in-memory maps if MongoDB is offline.

### 5. Live Telemetry Diagnostics Panel (`frontend/frontend/src/components/AudioDiagnosticsPanel.jsx`)
- Directly queries browser `RTCPeerConnection.getStats()` every second.
- Visualizes real RTT latency, jitter, packet loss count, NetEQ jitter buffer delay, incoming bitrate in kbps, negotiated codec, and candidate connection types.

### 6. Office Productivity UI (`frontend/frontend/src/components/`)
- **Colleague Radar (`UserList.jsx`)**: Live list of people in the room with distances in pixels, earshot badges, and mute indicators.
- **Team Chat (`TeamChat.jsx`)**: In-room text messaging with unread badge indicators.
- **Audio Toolbar (`AudioControls.jsx`)**: Instant microphone toggle, speaker deafen, and listening radius slider (50px to 300px).

---

## Architecture & Audio Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                       ProxiSpeak Mesh                       │
└─────────────────────────────────────────────────────────────┘

    [ Client A ] ◄─────── WebRTC Audio Stream (P2P) ──────► [ Client B ]
         │                                                        │
         │ (Signaling / Position Updates / Room State)            │
         ▼                                                        ▼
    ┌─────────────────────────────────────────────────────────────┐
    │          Node.js + Express + Socket.IO Server               │
    │         (Port 5000 - In-Memory / MongoDB Store)             │
    └─────────────────────────────────────────────────────────────┘
```

### Remote Audio Graph (per remote participant)

```
Remote WebRTC Audio Track
          │
          ▼
MediaStreamAudioSourceNode
          │
          ▼
Individual GainNode ──────────► Proximity Attenuation: max(0, 1 - d/R)
          │
          ▼
Individual PannerNode ────────► HRTF Spatial Panning: (remX, 0, remY)
          │
          ▼
AudioDestinationNode (Speakers / Headphones)
```

---

## Project Structure

```text
ProxiSpeak-member4-canvas/
├── backend/                             # Express & Socket.IO Signaling Server
│   ├── src/
│   │   ├── models/                      # MongoDB Schemas (Avatar, Participant, Room)
│   │   ├── routes/                      # REST endpoints (rooms, avatars)
│   │   ├── services/                    # Geospatial proximity calculations
│   │   ├── app.js                       # Express app configuration
│   │   ├── server.js                    # HTTP server entry point (Port 5000)
│   │   └── socketServer.js              # Socket.IO room coordination & WebRTC signaling
│   ├── test/                            # Backend integration and signaling tests
│   └── package.json
│
├── frontend/frontend/                   # React + Vite Client
│   ├── src/
│   │   ├── components/
│   │   │   ├── AudioControls.jsx        # Microphone, deafen, and radius controls
│   │   │   ├── AudioDiagnosticsPanel.jsx# Live WebRTC statistics panel
│   │   │   ├── ConnectionStatus.jsx     # Connection banner and mode switch
│   │   │   ├── Dashboard.jsx            # Colleague list, spatial metrics, and chat
│   │   │   ├── Login.jsx                # Guest login and room selection
│   │   │   ├── OfficeCanvas.jsx         # 2D canvas office renderer & movement loop
│   │   │   ├── OfficeHeader.jsx         # Navigation header and controls
│   │   │   ├── TeamChat.jsx             # In-room text messaging
│   │   │   └── UserList.jsx             # Active participants with live audio states
│   │   ├── hooks/
│   │   │   ├── useMicrophone.js         # Media capture and mute management
│   │   │   ├── useSocket.js             # Socket.IO client and WebRTC orchestration
│   │   │   └── useSpatialAudio.js       # 60 FPS spatial audio loop
│   │   ├── services/
│   │   │   ├── audioEngine.js          # Web Audio API 3D spatial engine singleton
│   │   │   ├── authApi.js               # Authentication helper
│   │   │   ├── roomApi.js               # Workspace creation & validation
│   │   │   ├── socket.js                # Socket.IO client singleton
│   │   │   └── webrtc.js                # Full-mesh WebRTC connection manager
│   │   ├── utils/
│   │   │   ├── audioCalculations.js     # Distance attenuation & stereo panning
│   │   │   ├── distance.js              # Euclidean distance formulas
│   │   │   ├── movement.js              # Collision detection and movement step math
│   │   │   ├── officeLayout.js          # Desks, chairs, and wall coordinate definitions
│   │   │   └── spatialAudio.test.js     # Spatial math & Opus SDP unit test suite
│   │   ├── App.jsx                      # Main application container
│   │   └── main.jsx                     # Application bootstrap
│   ├── .env                             # Frontend environment variables
│   ├── package.json
│   └── vite.config.js
│
└── README.md
```

---

## Prerequisites

- **Node.js**: v20.0.0 or higher
- **npm**: v9.0.0 or higher
- **Modern Browser**: Chrome, Edge, Firefox, or Safari (Chrome/Edge recommended for full WebRTC stats)
- **MongoDB** *(Optional)*: If MongoDB is running on `mongodb://127.0.0.1:27017/proxispeak`, the backend uses atomic persistence. If offline, the server gracefully falls back to fast in-memory registries.

---

## Quick Start

### 1. Backend Setup

Open a terminal and navigate to the backend directory:

```bash
cd backend
npm install
npm run dev
```

The backend server starts on **`http://localhost:5000`**.  
You should see:
```text
Connected to MongoDB (or running with memory state for real-time signaling)
ProxiSpeak API & WebRTC Signaling server listening on port 5000
```

### 2. Frontend Setup

In a second terminal, navigate to the frontend directory:

```bash
cd frontend/frontend
npm install
npm run dev
```

The Vite development server starts on **`http://localhost:5173`**.

Open your browser to `http://localhost:5173`. Enter a username (or click **Guest Access**) and join a room (e.g. `MAIN-OFFICE`).

> **Multi-User Tip**: Open two or more browser tabs or windows to simulate multiple colleagues in the virtual office.

---

## Environment Variables

### Backend (`backend/.env` or system environment)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Port for Express REST API and Socket.IO signaling |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/proxispeak` | Optional MongoDB connection string |

### Frontend (`frontend/frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_SOCKET_URL` | `http://localhost:5000` | Socket.IO signaling server endpoint |
| `VITE_API_URL` | `http://localhost:5000` | Express REST API endpoint |
| `VITE_ICE_SERVERS` | *(Google STUN servers)* | Optional custom STUN/TURN JSON configuration |

---

## Controls & Usage

### Avatar Movement

| Action | Control |
|---|---|
| **Move Up / Down / Left / Right** | `W`, `A`, `S`, `D` or Arrow Keys |
| **Point & Click to Walk** | Click anywhere on the office canvas |
| **Avatar Facing Direction** | Direction indicator dot rotates to match movement |

### Audio & Communication

| Feature | Description |
|---|---|
| **Microphone Toggle** | Click the microphone icon in the bottom toolbar to unmute. |
| **Mute / Deafen** | Toggle mic mute or deafen (mutes all incoming peer audio). |
| **Audio Radius Slider** | Adjust your listening range (50px to 300px) directly in the audio controls. |
| **Colleagues Sidebar** | View real-time proximity distances, mute statuses, and earshot badges. |
| **Team Chat** | Send text messages to colleagues in your active room. |

---

## Testing & Verification

### Frontend Unit Tests (Spatial Math & Opus SDP)

```bash
cd frontend/frontend
npm test
```

Verifies:
1. Euclidean distance calculations.
2. Distance-based volume attenuation ($gain = \max(0, 1 - d/R)$).
3. 3D directional positioning (left/right panning).
4. Distance dynamics (closer = louder, farther = quieter, out of bounds = mute).
5. Proximity connection hysteresis.
6. Opus SDP transformations (`usedtx=0`, `useinbandfec=1`, `maxaveragebitrate=64000`).

### Frontend Production Build

```bash
cd frontend/frontend
npm run build
```

Builds optimized production assets to `frontend/frontend/dist/`.

### Backend Integration Tests

```bash
cd backend
npm test
```

Runs the Node.js test runner covering room routes, spatial query bounding boxes, and username validation suites.

---

## WebRTC & Audio Engineering Highlights

### 1. W3C Perfect Negotiation & Offer Glare Resolution
Peer connections use deterministic polite assignment:
```javascript
const polite = String(localUserId) < String(peerId);
```
During simultaneous offer collisions (glare), the polite peer executes an explicit `rollback` before setting the remote offer, eliminating `InvalidStateError` renegotiation crashes.

### 2. High-Fidelity Speech Optimization (`optimizeOpusSdp`)
Every SDP offer and answer is dynamically injected with parameters tuned for crystal-clear real-time voice:
```
minptime=10;ptime=20;useinbandfec=1;maxaveragebitrate=64000;stereo=0;sprop-stereo=0;cbr=0;usedtx=0
```
- **`usedtx=0`**: Disables Opus Discontinuous Transmission, preventing words from cutting off during quiet speech or at the end of sentences.
- **`useinbandfec=1`**: Enables In-Band Forward Error Correction so lost packets are reconstructed from adjacent packets.
- **`ptime=20`**: Enforces a strict 20ms packet interval to stabilize jitter buffers.

### 3. Smooth Spatial Transitions Without Queue Churn
Audio parameters are only scheduled when an avatar actually moves or turns:
- 40ms exponential smoothing via `setTargetAtTime` prevents audible clicks and pops.
- Stationary avatars bypass automation scheduling, allowing the Web Audio thread to run in its fast-path with zero CPU jitter.

---

## Diagnostics Panel

Click the **Diagnostics** button in the top navigation bar to open the live telemetry drawer. The panel queries `RTCPeerConnection.getStats()` every second to display:

- **Connection State**: `connected`, `connecting`, `closed`
- **Connection Type**: `Direct (P2P/STUN)` vs. `TURN Relay`
- **Negotiated Codec**: `audio/opus (48000Hz)`
- **Round-Trip Time (RTT)**: Live network latency in milliseconds
- **Jitter & Packet Loss**: Jitter in milliseconds and exact lost packet count
- **Jitter Buffer Delay**: Average delay inside NetEQ
- **Incoming Bitrate**: Real-time throughput in kbps
- **3D Spatial State**: Current gain, pan (-1.0 to +1.0), distance in pixels, and 3D coordinates

---

## Troubleshooting

### Microphone access denied
- Browser media capture requires **`localhost`** or **HTTPS**.
- Ensure microphone permissions are granted in your browser address bar settings.

### Cannot hear other participants
- Check that both participants are within each other's **Audio Radius** circle (blue dotted circle around your avatar).
- Ensure your speaker/deafen toggle is not muted.
- Click anywhere on the page to unlock the browser's `AudioContext` autoplay security policy.

### Backend port conflict
- If port `5000` is already in use by another service (e.g. macOS AirPlay Receiver), set `PORT=5001` in `backend/.env` and update `VITE_SOCKET_URL=http://localhost:5001` in `frontend/frontend/.env`.

---

## License

This project is licensed under the MIT License.
