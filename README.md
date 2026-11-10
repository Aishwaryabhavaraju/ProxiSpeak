# ProxiSpeak — Geospatial Proximity-Based Virtual Office & Spatial Audio Platform

**ProxiSpeak** is an immersive virtual office communication platform that combines HTML5 2D canvas navigation with real-time peer-to-peer WebRTC audio/video and Web Audio API spatial attenuation. Avatars navigate an interactive virtual office floor, and their voices dynamically attenuate and pan in stereo based on distance, angle, and physical obstacles (walls and furniture)—recreating the organic acoustics of a real physical office.

---

## 🌟 Key Features

- **2D Virtual Office Canvas & Navigation**:
  - Smooth 60 FPS animation loop with delta-time scaling.
  - **Cursor-Click Navigation**: Click or drag anywhere on the office floor to move your avatar smoothly to that location with zero shaking or jitter.
  - **Keyboard Controls**: Seamless WASD and Arrow key navigation with axis sliding around furniture corners.
  - Interactive visual feedback: glowing destination beacons, direction pointers, name badges, and avatar initials.
- **Distance-Based Spatial Audio**:
  - **100px Earshot Radius**: Automatic peer audio connectivity when avatars are within 100 pixels.
  - **Quadratic Distance Attenuation**: Volume scales naturally via $\text{gain} = \left(1 - \frac{d}{R}\right)^2$.
  - **Stereo Panning**: Real-time horizontal audio panning ($\text{clamp}(-1, 1, \Delta x / R)$) localized in stereo headphones.
  - **Sound Obstruction Detection**: Liang-Barsky line-rectangle clipping detects furniture and walls between avatars, applying an acoustic dampening factor ($0.25\times$) for blocked lines of sight.
  - **Hysteresis Buffer**: 18px boundary buffer prevents rapid audio connection toggling when lingering at the earshot threshold.
  - **Chromium Keep-Alive**: Prevents browser audio decoder throttling on remote streams.
- **WebRTC Voice, Video & Screen Sharing**:
  - P2P mesh audio streaming with W3C **Perfect Negotiation** (polite peer offer collision rollback).
  - WebRTC video camera streaming and screen presentation mode (`🖥️ PRESENTING`).
  - Candidate queuing, `.toJSON()` serialization, and automated ICE restart on network changes.
- **Virtual Office Collaboration**:
  - **Rooms**: Multiple customizable office rooms (`MAIN-OFFICE`, custom codes) with persistent layouts.
  - **Room Chat & DMs**: Public room channels with emoji reactions and private 1-to-1 direct messaging.
  - **Status & Reactions**: Hand-raising status (✋) and temporary floating avatar emoji reactions (👍, ❤️, 👏, 🎉, 🔥, 💡).
  - **Meeting Scheduler**: Schedule upcoming meetings with start/end times and persistent calendar tracking.
- **Resilient Backend & Offline Mode**:
  - Express + Socket.IO + MongoDB with planar `2d` index.
  - **Resilient In-Memory Mode**: If MongoDB Atlas IP is not whitelisted, the server automatically enters in-memory fallback without crashing, keeping all APIs, Socket.IO, and WebRTC streaming 100% operational.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite, HTML5 Canvas, Web Audio API, WebRTC (`RTCPeerConnection`), Lucide Icons |
| **Backend** | Node.js, Express, Socket.IO, Mongoose / MongoDB Atlas, Redis Adapter |
| **Spatial Engine** | Planar Euclidean distance, Liang-Barsky line clipping, Web Audio Gain/StereoPanner nodes |
| **State Management** | Ref-based mutable 60 FPS physics state + throttled 10 Hz React snapshot sync |

---

## 📁 Repository Structure

```
ProxiSpeak/
├── backend/                        # Node.js + Express + Socket.IO Backend
│   ├── config/                     # MongoDB connection & Redis configuration
│   ├── models/                     # Mongoose Schemas (Avatar, OfficeLayout, Meeting, Chat)
│   ├── routes/                     # REST API routers (auth, rooms, layout, chat, meetings)
│   ├── services/                   # Audio routing, spatial audio & sound obstruction services
│   ├── utils/                      # Fast proximity, tracker, state manager & earshot logic
│   ├── test/                       # 10 comprehensive backend test suites (26 unit tests)
│   ├── server.js                   # Main application entry point & Socket.IO handlers
│   └── README.md                   # Backend documentation
├── frontend/                       # React 18 + Vite Frontend
│   ├── src/
│   │   ├── components/             # OfficeCanvas, Toolbar, VideoGrid, Chat, Modals, Header
│   │   ├── hooks/                  # useSpatialAudio, useSocket, useMicrophone
│   │   ├── services/               # audioEngine, webrtcManager, authApi, socket
│   │   ├── utils/                  # movement, officeLayout, audioCalculations, performanceMonitor
│   │   ├── styles/                 # Dark-theme CSS modules
│   │   ├── App.jsx                 # Main meeting room stage & 60 FPS movement loop
│   │   └── main.jsx                # React root entry
│   ├── dist/                       # Production build distribution
│   └── README.md                   # Frontend documentation
├── docs/                           # Architecture guides and signaling documentation
│   ├── signaling-client-integration.md # Member 1 & Socket.IO events guide
│   └── spatial-audio-and-movement.md  # Physics, acoustics, and WebRTC lifecycle guide
└── README.md                       # Project overview (this file)
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v20 or higher
- **MongoDB**: Local MongoDB instance or free MongoDB Atlas cluster

### 1. Backend Setup

```powershell
cd backend
npm install
npm test
node server.js
```

The backend starts on port `5000` (`http://localhost:5000`).

> [!NOTE]
> If your current IP is not yet whitelisted on MongoDB Atlas, the backend automatically activates **Resilient In-Memory Mode** and logs whitelist instructions without crashing. Express, Socket.IO, and WebRTC remain fully functional.

### 2. Frontend Setup

```powershell
cd frontend
npm install
npm test
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🧪 Testing Suites

### Backend Unit Tests (26 Tests)
```powershell
cd backend
node --test test/officeLayoutRoutes.test.js test/soundObstructionAndSpatial.test.js test/chatAndMeetingRoutes.test.js test/audioRoutingService.test.js test/authAndRoom.test.js test/proximityTracker.test.js test/webrtcRelay.test.js test/day27Validation.test.js test/proximity.test.js
```
*Validates room layout persistence, sound obstruction clipping, chat and meeting APIs, proximity tracker, enter/exit transitions, and WebRTC relay signaling.*

### Frontend Unit Tests
```powershell
cd frontend
node src/utils/performanceAndMovement.test.js
node src/utils/spatialAudio.test.js
```
*Validates 60 FPS performance monitoring, delta-time movement normalization, Euclidean distance, quadratic volume attenuation, stereo panning, and hysteresis boundary buffers.*

### Production Build
```powershell
npm run build --prefix frontend
```
*Compiles Vite bundle with zero errors.*

---

## 🎮 How to Test Multi-User Audio & Proximity

1. Open two browser tabs at `http://localhost:5173`.
2. Tab 1: Login as **Alice**, enter room `MAIN-OFFICE`, and enable the microphone.
3. Tab 2: Login as **Bob**, enter room `MAIN-OFFICE`.
4. Click anywhere on the office floor to move avatars:
   - **Outside 100px**: Spatial audio indicator shows `Out of earshot` (Gain: 0.00).
   - **Inside 100px**: WebRTC peer audio connects immediately with volume scaling up to 100% and panning based on your relative position.
   - **Behind Walls/Desks**: Audio dampens by $0.25\times$ to simulate physical sound blockage.
