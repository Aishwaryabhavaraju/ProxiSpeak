# Spatial Audio, Obstacle Attenuation & Movement Physics

This document provides a comprehensive technical breakdown of ProxiSpeak's audio spatialization, sound obstacle detection, and avatar movement mechanics.

---

## 1. Spatial Audio Attenuation Model

The platform uses the Web Audio API to process remote incoming WebRTC audio tracks through a localized processing graph:

```
[Remote MediaStreamTrack]
         │
         ▼
[MediaStreamAudioSourceNode]
         │
         ▼
    [GainNode]  <── (Distance Attenuation + Sound Obstruction Dampening)
         │
         ▼
[StereoPannerNode]  <── (Relative Horizontal Angle / Pan)
         │
         ▼
[AudioDestinationNode (Speakers/Headphones)]
```

### A. Distance Volume Attenuation
Within the standard 100-pixel earshot radius ($R = 100\text{px}$), volume follows an inverse-quadratic falloff:

$$\text{gain}_{\text{distance}} = \max\left(0,\, 1 - \frac{d}{R}\right)^2$$

Where:
- $d = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$ is the Euclidean distance in virtual office units.
- At $d = 0\text{px}$: $\text{gain} = 1.0$ (100% volume).
- At $d = 50\text{px}$: $\text{gain} = 0.25$ (25% volume).
- At $d \ge 100\text{px}$: $\text{gain} = 0.0$ (completely silent).

### B. Sound Obstruction Dampening
When the straight line segment between two avatars intersects a solid furniture obstacle or interior wall, a physical dampening factor is multiplied:

$$\text{gain}_{\text{final}} = \text{gain}_{\text{distance}} \times \left(\text{isObstructed} \ ?\ 0.25 : 1.0\right)$$

This allows users standing directly behind a cubicle partition or boardroom wall to hear muffled voices without full acoustic clarity.

### C. Stereo Panning
Panning localizes sound in the listener's stereo field based on the speaker's horizontal offset $\Delta x = x_{\text{speaker}} - x_{\text{listener}}$:

$$\text{pan} = \text{clamp}\left(-1.0,\, 1.0,\, \frac{\Delta x}{R}\right)$$

- $\text{pan} = -1.0$: Hard Left.
- $\text{pan} = 0.0$: Centered.
- $\text{pan} = +1.0$: Hard Right.

### D. Parameter Smoothing
To eliminate zipper noise, clicks, or syllable truncation at 60 FPS:
```javascript
gainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.04);
pannerNode.pan.setTargetAtTime(clampedPan, audioCtx.currentTime, 0.04);
```
A 40ms exponential time constant delivers smooth, click-free parameter transitions.

---

## 2. Liang-Barsky Sound Obstacle Clipping Algorithm

The sound obstruction service ([backend/services/soundObstructionService.js](file:///backend/services/soundObstructionService.js)) uses the **Liang-Barsky Line-Rectangle Intersection Algorithm** to check if the direct line between avatar positions intersects any obstacle bounding box:

Given start avatar $(x_1, y_1)$, end avatar $(x_2, y_2)$, and rectangle $(x_{\min}, y_{\min}, x_{\max}, y_{\max})$:

$$\Delta x = x_2 - x_1, \quad \Delta y = y_2 - y_1$$
$$p = [-\Delta x,\, \Delta x,\, -\Delta y,\, \Delta y]$$
$$q = [x_1 - x_{\min},\, x_{\max} - x_1,\, y_1 - y_{\min},\, y_{\max} - y_1]$$

For each clipping boundary $i \in \{0, 1, 2, 3\}$:
- If $p_i = 0$ (parallel to boundary) and $q_i < 0$, the line is outside.
- $t = q_i / p_i$. If $p_i < 0$, $t_{\min} = \max(t_{\min}, t)$; else $t_{\max} = \min(t_{\max}, t)$.
- If $t_{\min} > t_{\max}$, there is no intersection.

---

## 3. Avatar Movement & Axis-Sliding Physics

Avatar movement operates in an optimized 60 FPS requestAnimationFrame loop with delta-time ($\Delta t$) scaling:

### A. Navigation Modes
1. **Cursor-Click / Touch Navigation**:
   - Clicking or dragging on the office floor sets `targetX` and `targetY`.
   - The avatar moves at $160\text{px/sec}$ along the target vector:
     $$\text{step} = \min(\text{distance},\, 160 \times \Delta t)$$
   - When within $3\text{px}$, the avatar cleanly completes its movement and nullifies `targetX` and `targetY` to prevent oscillation.
2. **WASD / Arrow Keys**:
   - Normalized diagonal vectors: $\text{step} = \frac{(k_x, k_y)}{\sqrt{k_x^2 + k_y^2}} \times 160 \times \Delta t$.
   - Pressing keys automatically cancels any active click destination.

### B. Axis-Sliding Collision Avoidance
When moving by $(\Delta x, \Delta y)$:
1. **Full Diagonal Check**: If $(x + \Delta x, y + \Delta y)$ is collision-free, move there.
2. **Horizontal Slide**: If diagonal collides, test $(x + \Delta x, y)$. If free, avatar glides horizontally along the obstacle face.
3. **Vertical Slide**: If horizontal collides, test $(x, y + \Delta y)$. If free, avatar glides vertically.
4. **Clean Halt**: If both axes are obstructed, the movement stops cleanly (`blocked: true`) without artificial repulsive forces or corner jitter.
