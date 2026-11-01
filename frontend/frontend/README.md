# ProxiSpeak – Frontend Application

> **React 18 + Vite Virtual Office Client with WebRTC Audio Mesh & 3D Web Audio API Spatialization**

This directory contains the complete frontend client implementation for **ProxiSpeak**.

---

## What Has Been Built (Implemented Features)

### 1. 2D Interactive Office Canvas (`src/components/OfficeCanvas.jsx`)
- **60 FPS Animation & Rendering**: High-performance HTML5 `<canvas>` rendering office rooms, meeting spaces, furniture, desks, and avatars.
- **Fluid Avatar Movement**: Supports `W`, `A`, `S`, `D`, arrow keys, and mouse point-and-click pathfinding.
- **Collision Detection (`src/utils/movement.js`)**: Full obstacle collision math preventing avatars from walking through walls, desks, and office boundaries.
- **Directional Orientation**: Visual indicator dot showing facing angle, synchronized with the Web Audio `AudioListener` forward vector.

### 2. True 3D Web Audio Engine (`src/services/audioEngine.js`)
- **HRTF Binaural Panning**: Individual `PannerNode` using Head-Related Transfer Function (`HRTF`) for authentic stereo localization based on canvas $(x, y)$ coordinates.
- **Distance Attenuation**: Individual `GainNode` scaling volume linearly from $1.0$ at point-blank distance to $0.0$ at the boundary of the configurable `audioRadius`.
- **40ms Smooth Transitions**: Exponential smoothing (`setTargetAtTime`) prevents pops, clicks, and parameter jumping during avatar movement.
- **Stationary Fast-Path**: Eliminates parameter queue churn when avatars stand still, saving CPU and preventing audio rendering dropouts.
- **AudioContext Lifecycle**: Auto-unlocks on user interaction (autoplay compliance) and auto-resumes if the browser suspends background tabs.
- **Chromium Keep-Alive Audio Element**: Satisfies Chromium's RTP decoder requirements without producing duplicate sound.

### 3. Enterprise WebRTC Audio Manager (`src/services/webrtc.js`)
- **Full-Mesh Architecture**: Direct P2P audio transmission between all connected participants in a room.
- **W3C Perfect Negotiation**: Deterministic polite/impolite glare resolution handling simultaneous offers without collision errors.
- **Dynamic Track Swapping (`replaceTrack`)**: Instant microphone mute/unmute and track replacement with **0ms renegotiation latency**.
- **Opus Codec Optimization (`optimizeOpusSdp`)**:
  - `usedtx=0`: Disables Opus Discontinuous Transmission, completely eliminating voice dropouts and clipped word endings.
  - `useinbandfec=1`: Recovers lost audio packets using in-band forward error correction.
  - `ptime=20`: Locks 20ms audio frame packet pacing for stable jitter buffer performance.
  - `maxaveragebitrate=64000`: Crisp 64kbps speech bandwidth.
- **Trickle ICE & Queue**: Candidates arriving before `setRemoteDescription` are queued and flushed safely.

### 4. Live Telemetry Diagnostics Panel (`src/components/AudioDiagnosticsPanel.jsx`)
- Queries `RTCPeerConnection.getStats()` in real-time.
- Shows live RTT latency, network jitter, packet loss count, NetEQ jitter buffer delay, incoming bitrate in kbps, negotiated codec, candidate connection type (`Direct P2P` vs `TURN Relay`), and spatial $(x, z)$ coordinates.

### 5. Multi-User State & Signaling (`src/hooks/useSocket.js`)
- Connects to Socket.IO signaling server at `http://localhost:5000`.
- Synchronizes user join, leave, position broadcast (throttled to 20 Hz / 50ms), and microphone mute state.
- Gracefully handles offline fallback to local simulation mode if the backend server is temporarily unreachable.

### 6. Team Productivity & UI (`src/components/`)
- **Colleague List (`UserList.jsx`)**: Real-time listing of room participants with live proximity distance, earshot indicators, and mute badges.
- **Integrated Team Chat (`TeamChat.jsx`)**: In-office chat room with unread notification badges.
- **Audio Controls Toolbar (`AudioControls.jsx`)**: Microphone toggle, speaker deafen, and listening radius slider (50px – 300px).
- **Guest Access & Authentication (`Login.jsx`)**: One-click instant guest entrance or custom username and room selection.

---

## Directory Layout

```text
frontend/frontend/
├── src/
│   ├── components/
│   │   ├── AudioControls.jsx         # Bottom audio controls (mic, deafen, radius)
│   │   ├── AudioDiagnosticsPanel.jsx # Real-time WebRTC getStats() telemetry panel
│   │   ├── ConnectionStatus.jsx      # Top connection status banner
│   │   ├── Dashboard.jsx             # Sidebar containing Colleague list & Chat
│   │   ├── Login.jsx                 # Login and workspace entry modal
│   │   ├── OfficeCanvas.jsx          # 2D canvas office renderer & movement loop
│   │   ├── OfficeHeader.jsx          # Top navigation bar
│   │   ├── TeamChat.jsx              # In-room text chat
│   │   ├── Toolbar.jsx               # Workspace action bar
│   │   ├── UserAvatar.jsx            # Avatar icon rendering helper
│   │   └── UserList.jsx              # Colleague proximity & audio state list
│   ├── hooks/
│   │   ├── useMicrophone.js          # getUserMedia microphone management
│   │   ├── useSocket.js              # Socket.IO connection & signaling loop
│   │   └── useSpatialAudio.js        # 60 FPS spatial audio updater hook
│   ├── services/
│   │   ├── audioEngine.js           # Web Audio API 3D spatial sound engine
│   │   ├── authApi.js                # Auth service
│   │   ├── roomApi.js                # Room discovery REST client
│   │   ├── socket.js                 # Socket.IO singleton
│   │   └── webrtc.js                 # WebRTC full-mesh connection manager
│   ├── styles/                       # CSS stylesheets for all components
│   ├── utils/
│   │   ├── audioCalculations.js      # Attenuation, panning, and hysteresis math
│   │   ├── distance.js               # Euclidean distance calculation
│   │   ├── movement.js               # Collision detection & path bounds
│   │   ├── officeLayout.js           # Coordinate definitions for office furniture
│   │   └── spatialAudio.test.js      # Unit test suite for spatial math & SDP
│   ├── App.jsx                       # Root workspace view
│   └── main.jsx                      # Vite entry point
├── .env                              # VITE_SOCKET_URL=http://localhost:5000
├── package.json
└── vite.config.js
```

---

## How to Run

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Vite Development Server
```bash
npm run dev
```
Client runs at **`http://localhost:5173`**.

### 3. Run Spatial Audio & Codec Unit Tests
```bash
npm test
```
Executes 6 test suites verifying Euclidean distance, linear attenuation, directional panning, movement dynamics, proximity hysteresis, and Opus SDP optimizations.

### 4. Build Production Bundle
```bash
npm run build
```
Generates production assets into `dist/`.
