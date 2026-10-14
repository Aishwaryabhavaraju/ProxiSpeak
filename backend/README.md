# ProxiSpeak Geospatial Backend

This backend slice tracks avatar positions and answers proximity queries. It uses MongoDB's planar `2d` index, so `[x, y]` and radius values are expressed in virtual-world units, not meters. Signaling and WebRTC orchestration are not included in this slice.

## Run

Requires Node.js 20+ and MongoDB.

```powershell
$env:MONGODB_URI = "mongodb://127.0.0.1:27017/proxispeak"
npm install
npm start
```

The service listens on port `3000` by default; set `PORT` to change it.

## API

- `PUT /api/avatars/:userId/location` with JSON `{ "x": 12, "y": 8 }` creates or updates an avatar.
- `GET /api/avatars/:userId/nearby?radius=5&limit=100` returns other avatars within the requested radius, ordered nearest first.
- `GET /api/avatars/within?x=12&y=8&radius=5&limit=100` returns avatars inside a circle using `$geoWithin`.
- `GET /health` reports service health.

Radius must be greater than `0` and at most `5000`; result limits range from `1` to `200`.

Run the focused query tests with `npm test`.