# Spatial audio and room persistence

This folder contains a mountable room-configuration API and a browser-side
spatial audio module. No files outside this folder need to be changed.

## Room API

`roomApi.js` exports `mountRoomApi({ app, express, mongoose })`. Call it after
creating the Express app and before starting the server; it registers
`/api/rooms/:roomId` and returns the MongoDB `Room` model. The API uses the
existing MongoDB connection and Express instance supplied by the host.
For example, from a backend entry point:

```js
const { mountRoomApi } = require("../Spatial audio/roomApi");

mountRoomApi({ app, express, mongoose });
```

- `PUT /api/rooms/:roomId` creates or replaces a room configuration.
- `GET /api/rooms/:roomId` loads the saved configuration, or returns `404`.

Room IDs may contain letters, numbers, `_` and `-` and are limited to 100
characters. A configuration has this shape:

```json
{
  "layout": { "width": 20, "height": 15 },
  "furniture": [
    { "id": "table-1", "type": "table", "x": 4, "y": 5, "width": 2, "height": 1 }
  ],
  "obstacles": [
    {
      "id": "wall-1",
      "type": "wall",
      "x": 10,
      "y": 5,
      "width": 1,
      "height": 8,
      "attenuation": 0.2
    }
  ]
}
```

Coordinates identify rectangle centers in the same virtual-world units as
avatar positions. `rotation` is optional and expressed in degrees. Obstacle
`attenuation` is an optional gain multiplier from `0` (silent) to `1` (no
attenuation); it overrides the audio module's default obstruction multiplier
for that obstacle. Multiple intersecting obstacle multipliers compound.

## Spatial audio

`spatialAudio.js` exports `createSpatialAudio({ audioContext, maxDistance,
smoothingTime, obstructionGain })`. Attach each remote media stream once, then
call `updatePeer` whenever local or remote positions change:

```js
const spatialAudio = createSpatialAudio({ audioContext });
spatialAudio.attach(peerId, remoteStream);
spatialAudio.updatePeer(peerId, {
  localPosition: { x: localX, y: localY },
  remotePosition: { x: remoteX, y: remoteY },
  obstacles: room.obstacles,
  furniture: room.furniture,
});
```

Distance controls linear attenuation to silence at `maxDistance`; the relative
horizontal coordinate controls stereo panning. Rotated rectangular obstacles
and furniture intersecting the line between avatars attenuate gain. Obstacles
use their configured multiplier when present; furniture uses `obstructionGain`.
Gain and pan changes are smoothed with
`AudioParam.setTargetAtTime`. Browsers without
`StereoPannerNode` use `PannerNode`. Call `detach(peerId)` when a peer leaves
and `close()` when disposing the audio manager.

## Tests

Run the dependency-free focused tests from this directory:

```powershell
node --test
```
