[README_Member4_WebRTC.md](https://github.com/user-attachments/files/33923420/README_Member4_WebRTC.md)
# ProxiSpeak --- Member 4: WebRTC Integration & Dynamic Spatial Attenuation

## Overview

ProxiSpeak is a geospatial proximity-based audio collaboration platform.
It combines a virtual office interface with real-time communication so
that nearby avatars can hear one another more clearly, while audio fades
as users move farther apart.

This document summarizes Member 4's WebRTC integration and dynamic
spatial-audio responsibilities.

## Responsibilities

-   Capture microphone audio using the browser's `getUserMedia()` API.
-   Establish peer-to-peer audio connections using WebRTC.
-   Exchange WebRTC offers, answers, and ICE candidates through
    Socket.IO signaling.
-   Process incoming audio through the Web Audio API.
-   Adjust remote audio volume and stereo panning according to avatar
    positions.
-   Test distance, attenuation, panning, and proximity-boundary
    calculations.

## Implementation Details

### 1. Microphone Capture

**File:** `frontend/src/hooks/useMicrophone.js`

The microphone hook manages local audio capture and microphone state.
The configured audio constraints include:

-   Echo cancellation to help reduce acoustic feedback.
-   Automatic gain control to help balance voice levels.
-   Mono input using a single audio channel.
-   Explicit handling of permission denials and unavailable microphone
    devices.
-   Microphone mute and unmute controls.

Noise suppression is disabled in the described configuration to avoid
overly aggressive suppression of speech. Actual audio quality depends on
the browser, operating system, and microphone hardware.

### 2. WebRTC Peer Connections

**File:** `frontend/src/services/webrtc.js`

The `WebRTCManager` manages peer-to-peer audio connections. Its
described responsibilities include:

-   Creating and managing `RTCPeerConnection` instances.
-   Handling offer and answer negotiation.
-   Applying a Perfect Negotiation approach to reduce offer-collision
    problems.
-   Buffering ICE candidates until a remote description is available,
    then applying them.
-   Supporting local-track changes and renegotiation.
-   Attaching incoming remote audio tracks when they become available.

WebRTC carries audio between peers; the signaling server helps peers
discover and negotiate their connection. Network configuration may
require STUN and, for some networks, TURN services.

### 3. Socket.IO Signaling

**File:** `backend/server.js`

The signaling server relays WebRTC signaling messages between connected
clients:

-   `webrtc-offer` --- forwards an SDP offer to the target peer.
-   `webrtc-answer` --- forwards an SDP answer to the other peer.
-   `webrtc-ice-candidate` --- forwards ICE candidates used during
    connection establishment.

The described implementation validates target IDs, prevents a client
from targeting itself, and checks whether the target peer is connected
before relaying signaling data.

### 4. Web Audio API Processing

**File:** `frontend/src/services/audioEngine.js`

Remote audio is processed using a Web Audio API graph:

`MediaStreamAudioSourceNode → GainNode → StereoPannerNode → AudioDestinationNode`

-   **GainNode:** controls remote audio loudness.
-   **StereoPannerNode:** positions the sound across the left and right
    stereo channels.
-   **AudioContext:** provides the processing environment.
-   **Parameter smoothing:** uses `AudioParam.setTargetAtTime()` to
    transition gain smoothly and reduce abrupt volume changes.
-   **Playback unlocking:** attempts to resume a suspended audio context
    following a user gesture, subject to browser autoplay policies.

The browser and operating system determine actual latency and playback
behavior; the configuration alone cannot guarantee the elimination of
all audio glitches.

### 5. Spatial Audio Calculations

**File:** `frontend/src/utils/audioCalculations.js`

#### Euclidean distance

For local avatar position `(x₁, y₁)` and remote avatar position
`(x₂, y₂)`:

\[ d = `\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}`{=tex} \]

#### Linear attenuation

For a configured audio radius `R`:

\[ g = `\max`{=tex}`\left`{=tex}(0, 1-`\frac{d}{R}`{=tex}`\right`{=tex})
\]

Example with `R = 100 px`:

               Distance   Gain   Approximate level
  --------------------- ------ -------------------
                   0 px    1.0                100%
                  50 px    0.5                 50%
                 100 px    0.0              Silent
    Greater than 100 px    0.0              Silent

The gain is a linear amplitude multiplier, not a direct percentage of
perceived loudness.

#### Stereo panning

The horizontal difference between avatars controls the pan:

\[ p = `\operatorname{clamp}`{=tex}`\left`{=tex}(-1, 1,
`\frac{x_{\text{remote}}-x_{\text{local}}}{R}`{=tex}`\right`{=tex}) \]

-   Negative values position audio to the left.
-   Zero centers the audio.
-   Positive values position audio to the right.
-   The result is clamped to the supported range from `-1` to `+1`.

#### Proximity hysteresis

The described entry threshold is `100 px`, while the exit threshold is
`118 px`. Using separate thresholds can reduce rapid state changes when
avatars hover around a boundary. Confirm that these thresholds match the
values in the current source code before changing them.

### 6. Real-Time Movement Integration

**Files:** - `frontend/src/App.jsx` -
`frontend/src/hooks/useSpatialAudio.js`

The spatial-audio integration uses avatar world coordinates to update
remote gain and pan as users move. The described design updates audio
parameters from the animation loop and uses mutable references for
rapidly changing coordinates to avoid unnecessary React re-renders.

For correct behavior, the audio update loop must use current avatar
positions and the correct peer-to-stream mapping. Performance and update
frequency should be verified in the running application.

## Files Associated With This Work

  -------------------------------------------------------------------------------
  File                                        Purpose
  ------------------------------------------- -----------------------------------
  `frontend/src/hooks/useMicrophone.js`       Microphone capture, permissions,
                                              and mute controls

  `frontend/src/services/webrtc.js`           WebRTC peer connections and
                                              negotiation

  `frontend/src/services/audioEngine.js`      Web Audio API processing and smooth
                                              gain changes

  `frontend/src/hooks/useSpatialAudio.js`     Spatial metrics and audio-engine
                                              integration

  `frontend/src/utils/audioCalculations.js`   Distance, attenuation, and panning
                                              calculations

  `frontend/src/utils/spatialAudio.test.js`   Unit tests for spatial-audio
                                              calculations

  `frontend/src/App.jsx`                      Avatar movement and real-time
                                              spatial updates

  `backend/server.js`                         Socket.IO signaling events
  -------------------------------------------------------------------------------

> **Repository note:** Verify the file paths against the current branch.
> Some repository versions may use a different backend entry point, such
> as `backend/src/server.js`.

## Testing

The supplied implementation summary reports **17 of 17 spatial-audio
unit tests passing**. This is a reported result and should be confirmed
by running the test suite against the current checkout.

From the frontend directory, install dependencies and run the test
command configured in `frontend/package.json`:

``` bash
cd frontend
npm install
npm test
```

If the project does not define an `npm test` script, inspect
`frontend/package.json` and use the test runner configured there.

Also perform a manual two-browser test:

1.  Start the backend and frontend.
2.  Open the application in two separate browser sessions.
3.  Grant microphone permission in both sessions.
4.  Confirm that both clients join the same office or room.
5.  Speak from one browser and confirm that the other receives audio.
6.  Move avatars closer and farther apart.
7.  Confirm that volume fades with distance and stereo panning responds
    to horizontal position.
8.  Test mute/unmute, permission denial, reconnection, and browsers on
    different networks.

Microphone access generally requires a secure context such as HTTPS, or
localhost during development. For reliable peer connectivity across
restrictive networks, configure appropriate ICE servers, including TURN
where needed.

## Known Considerations

-   Browser autoplay policies may require a user gesture before audio
    can play.
-   A successful signaling exchange does not by itself guarantee a
    connected WebRTC media path.
-   STUN/TURN configuration, firewall rules, and network conditions
    affect peer connectivity.
-   Stereo panning requires a compatible playback path and is most
    noticeable with stereo output.
-   Distance and audio-radius units must use the same coordinate scale.
-   The reported test count should be checked against the current test
    output before including it in a formal submission.

## Summary

Member 4's work focuses on connecting WebRTC peer audio to ProxiSpeak's
spatial environment. Socket.IO exchanges signaling messages, WebRTC
transports audio between peers, and the Web Audio API applies
distance-based gain and horizontal stereo panning as avatars move.
Together, these components are intended to make conversations feel more
natural in a shared virtual office.

------------------------------------------------------------------------

**Project:** ProxiSpeak\
**Role:** Member 4 --- WebRTC Integration & Dynamic Spatial Attenuation\
**Primary technologies:** WebRTC, Socket.IO, Web Audio API, React,
JavaScript, Node.js
