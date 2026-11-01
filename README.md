# ProxiSpeak

Geospatial proximity-based audio collaboration platform using React, Node.js, Socket.IO, WebRTC mesh, and Web Audio API.

## Project Structure

- `backend/`: Express + Socket.IO signaling server, avatar location tracking, and proximity room coordination.
- `frontend/`: React + Vite application with 2D HTML5 canvas virtual office, WebRTC full-mesh audio engine, and spatial audio with stereo panning.

## Quick Start

### 1. Start Backend Server
```bash
cd backend
npm install
npm run dev
```
Backend runs on `http://localhost:3000`.

### 2. Start Frontend App
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`.

### 3. Run Tests
```bash
cd backend
npm test
```
