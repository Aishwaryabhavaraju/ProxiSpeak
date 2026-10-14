const express = require("express");
const {
  buildNearbyFilter,
  buildWithinFilter,
} = require("../services/proximity");

const MAX_RADIUS = 5000;
const MAX_RESULTS = 200;

function asyncHandler(handler) {
  return (request, response, next) =>
    Promise.resolve(handler(request, response, next)).catch(next);
}

function readCoordinate(value) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function readRadius(value) {
  const radius = value === undefined ? 5 : Number(value);
  return Number.isFinite(radius) && radius > 0 && radius <= MAX_RADIUS
    ? radius
    : null;
}

function readLimit(value) {
  const limit = value === undefined ? 100 : Number(value);
  return Number.isInteger(limit) && limit > 0 && limit <= MAX_RESULTS
    ? limit
    : null;
}

function createAvatarRouter(Avatar) {
  const router = express.Router();

  router.put(
    "/:userId/location",
    asyncHandler(async (request, response) => {
      const { x, y } = request.body || {};
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return response.status(400).json({ error: "x and y must be finite numbers" });
      }

      const avatar = await Avatar.findOneAndUpdate(
        { userId: request.params.userId },
        { location: [x, y], lastSeen: new Date() },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      ).select("-__v");

      return response.json(avatar);
    })
  );

  router.get(
    "/within",
    asyncHandler(async (request, response) => {
      const x = readCoordinate(request.query.x);
      const y = readCoordinate(request.query.y);
      const radius = readRadius(request.query.radius);
      const limit = readLimit(request.query.limit);
      if (x === null || y === null || radius === null || limit === null) {
        return response.status(400).json({
          error: "Provide finite x/y coordinates, a radius from 0 to 5000, and a limit from 1 to 200",
        });
      }

      const avatars = await Avatar.find(buildWithinFilter(x, y, radius))
        .select("userId location lastSeen -_id")
        .limit(limit)
        .lean();
      return response.json({ avatars });
    })
  );

  router.get(
    "/:userId/nearby",
    asyncHandler(async (request, response) => {
      const radius = readRadius(request.query.radius);
      const limit = readLimit(request.query.limit);
      if (radius === null || limit === null) {
        return response.status(400).json({
          error: "Provide a radius from 0 to 5000 and a limit from 1 to 200",
        });
      }

      const speaker = await Avatar.findOne({ userId: request.params.userId })
        .select("location -_id")
        .lean();
      if (!speaker) {
        return response.status(404).json({ error: "Avatar not found" });
      }

      const [x, y] = speaker.location;
      const avatars = await Avatar.find(
        buildNearbyFilter(request.params.userId, x, y, radius)
      )
        .select("userId location lastSeen -_id")
        .limit(limit)
        .lean();
      return response.json({ avatars });
    })
  );

  return router;
}

module.exports = createAvatarRouter;