# ProxiSpeak — Frontend Client Application

The ProxiSpeak frontend is built with **React 18**, **Vite**, **HTML5 Canvas**, and the browser **Web Audio API** and **WebRTC API**. It provides an interactive 2D virtual office canvas, cursor-click navigation, dynamic spatial audio, and peer-to-peer video collaboration.

---

## 🎨 Features & Capabilities

- **Interactive 2D Virtual Office Canvas (`OfficeCanvas.jsx`)**:
  - High-performance 60 FPS HTML5 Canvas rendering.
  - **Cursor-Click Movement**: Click or drag anywhere on the canvas to move your avatar smoothly with zero shaking or oscillation.
  - **Collision-Aware Movement**: Slides smoothly around desks and meeting tables (`moveWithSliding`). Halts cleanly when obstructed.
  - **Walkable Boundary Clamping**: Click coordinates automatically clamp to the playable floor perimeter ($28\text{px}$ margin from walls).
  - Direction pointer, avatar color customization, animated speaking ripple, hand-raise badges, and floating emoji reaction bubbles.
  - Cyan glowing destination beacon indicating current target destination.
- **Web Audio API Spatial Audio Graph (`audioEngine.js`)**:
  - Pipeline: `MediaStreamAudioSourceNode` → `GainNode` → `StereoPannerNode` → `AudioDestinationNode`.
  - **Quadratic Volume Attenuation**: $\text{gain} = \left(1 - \frac{d}{R}\right)^2$ within $R = 100\text{px}$ earshot.
  - **Stereo Panning**: $\text{pan} = \text{clamp}\left(-1, 1, \frac{\Delta x}{R}\right)$.
  - **Smooth Parameter Ramping**: 40ms exponential time constant via `setTargetAtTime` prevents audio clicks or zipper noise.
  - **Obstacle Sound Dampening**: Multiplies gain by $0.25\times$ when sound line-of-sight is blocked by furniture or walls.
  - **Chromium Audio Keep-Alive**: Prevents browser audio decoder sleep on remote WebRTC media tracks.
- **WebRTC Voice & Video Mesh (`webrtc.js`)**:
  - W3C **Perfect Negotiation** pattern with polite peer offer collision rollback.
  - Simultaneous microphone audio, video camera streams, and screen sharing (`🖥️ PRESENTING`).
  - Ice candidate serialization with `.toJSON()` and queue flushing on remote description set.
- **Office Collaboration Tools**:
  - **Video Stage (`VideoGrid.jsx`)**: Active speakers, camera tiles, and screen share spotlight.
  - **Toolbar (`Toolbar.jsx`)**: Mic toggle, Camera toggle, Screen share, Hand raise (✋), Avatar reactions popup, Meeting scheduler, and Auto-walk mode.
  - **Sidebar (`TeamChat.jsx`, `DirectMessages.jsx`, `UserList.jsx`)**: Room chat with emoji reactions, 1-to-1 DMs, and colleague distance/volume controls.
  - **Meeting Scheduler Modal (`MeetingModal.jsx`)**: Schedule upcoming meetings with persistent room tracking.

---

## 📁 Source Code Structure

```
frontend/src/
├── components/
│   ├── AudioControls.jsx      # Master speaker mute & input volume controls
│   ├── ConnectionStatus.jsx   # Live connected / simulation indicator
│   ├── Dashboard.jsx          # Room selector & room creation modal
│   ├── DirectMessages.jsx     # Private 1-to-1 messaging panel
│   ├── EmojiPicker.jsx        # Emoji reaction selection popover
│   ├── Login.jsx              # User login and registration screen
│   ├── MeetingModal.jsx       # Schedule & view upcoming meetings
│   ├── OfficeCanvas.jsx       # 60 FPS Canvas rendering & pointer navigation
│   ├── OfficeHeader.jsx       # Top navigation bar with room code copy & earshot metrics
│   ├── TeamChat.jsx           # Public room chat channel
│   ├── Toolbar.jsx            # Action controls (Mic, Camera, Screen, Hand, Reactions)
│   ├── UserAvatar.jsx         # User avatar badge with initials
│   ├── UserList.jsx           # List of colleagues in room with earshot indicators
│   └── VideoGrid.jsx          # Camera tiles & screen share presentation
├── hooks/
│   ├── useMicrophone.js       # Microphone capture with echo cancellation
│   ├── useSocket.js           # Real-time Socket.IO event coordination & WebRTC signaling
│   └── useSpatialAudio.js     # Distance calculation & WebRTC peer lifecycle coordination
├── services/
│   ├── audioEngine.js         # Web Audio API graph, gain attenuation & stereo panning
│   ├── authApi.js             # REST API client for authentication
│   ├── roomApi.js             # REST API client for rooms & layouts
│   ├── socket.js              # Socket.IO client instance
│   └── webrtc.js              # RTCPeerConnection manager & perfect negotiation
├── utils/
│   ├── audioCalculations.js   # Volume falloff, panning & hysteresis math
│   ├── distance.js            # Planar Euclidean distance
│   ├── emojiData.js           # Emoji reaction definitions
│   ├── movement.js            # Axis sliding, boundary checks & interpolation
│   ├── officeLayout.js        # Desk, zone, plant, and wall coordinates
│   └── performanceMonitor.js  # Frame budget & FPS metrics
├── styles/                    # High-tech dark-theme CSS stylesheets
├── App.jsx                    # Main virtual office application & 60 FPS physics loop
└── main.jsx                   # Application root mounting
```

---

## 🛠️ Development & Production Scripts

```powershell
# Install dependencies
npm install

# Start Vite development server
npm run dev

# Run unit tests
node src/utils/performanceAndMovement.test.js
node src/utils/spatialAudio.test.js

# Build production bundle
npm run build

# Preview production build
npm run preview
```
