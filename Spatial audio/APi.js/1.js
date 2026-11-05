const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateLayout(layout) {
  return (
    isObject(layout) &&
    isFiniteNumber(layout.width) &&
    layout.width > 0 &&
    isFiniteNumber(layout.height) &&
    layout.height > 0
  );
}

function validateEntities(entities, kind) {
  if (!Array.isArray(entities)) return false;
  const ids = new Set();

  return entities.every((entity) => {
    if (
      !isObject(entity) ||
      typeof entity.id !== "string" ||
      entity.id.length === 0 ||
      ids.has(entity.id) ||
      typeof entity.type !== "string" ||
      entity.type.length === 0 ||
      !isFiniteNumber(entity.x) ||
      !isFiniteNumber(entity.y) ||
      !isFiniteNumber(entity.width) ||
      entity.width <= 0 ||
      !isFiniteNumber(entity.height) ||
      entity.height <= 0 ||
      (entity.rotation !== undefined && !isFiniteNumber(entity.rotation)) ||
      (kind === "obstacle" &&
        entity.attenuation !== undefined &&
        (!isFiniteNumber(entity.attenuation) ||
          entity.attenuation < 0 ||
          entity.attenuation > 1))
    ) {
      return false;
    }

    ids.add(entity.id);
    return true;
  });
}

function validateRoomConfiguration(configuration) {
  return (
    isObject(configuration) &&
    validateLayout(configuration.layout) &&
    validateEntities(configuration.furniture, "furniture") &&
    validateEntities(configuration.obstacles, "obstacle")
  );
}

function createRoomModel(mongoose) {
  if (!mongoose || !mongoose.Schema || typeof mongoose.model !== "function") {
    throw new TypeError("mongoose is required");
  }

  const roomSchema = new mongoose.Schema(
    {
      roomId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        maxlength: 100,
      },
      layout: { type: mongoose.Schema.Types.Mixed, required: true },
      furniture: { type: [mongoose.Schema.Types.Mixed], required: true },
      obstacles: { type: [mongoose.Schema.Types.Mixed], required: true },
    },
    { timestamps: true, versionKey: false }
  );

  return mongoose.models && mongoose.models.Room
    ? mongoose.models.Room
    : mongoose.model("Room", roomSchema);
}

function asyncHandler(handler) {
  return (request, response, next) =>
    Promise.resolve(handler(request, response, next)).catch(next);
}

function createRoomRouter({ express, Room }) {
  if (!express || typeof express.Router !== "function") {
    throw new TypeError("express is required");
  }
  if (!Room || typeof Room.findOne !== "function") {
    throw new TypeError("Room model is required");
  }

  const router = express.Router();

  router.get(
    "/:roomId",
    asyncHandler(async (request, response) => {
      const { roomId } = request.params;
      if (!ROOM_ID_PATTERN.test(roomId)) {
        return response.status(400).json({ error: "Invalid roomId" });
      }

      const room = await Room.findOne({ roomId }).select("-_id -__v").lean();
      if (!room) return response.status(404).json({ error: "Room not found" });
      return response.json(room);
    })
  );

  router.put(
    "/:roomId",
    asyncHandler(async (request, response) => {
      const { roomId } = request.params;
      if (!ROOM_ID_PATTERN.test(roomId)) {
        return response.status(400).json({ error: "Invalid roomId" });
      }
