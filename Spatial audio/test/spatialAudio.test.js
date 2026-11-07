const assert = require("node:assert/strict");
const test = require("node:test");
const {
  calculateDistanceGain,
  createSpatialAudio,
  segmentIntersectsRectangle,
} = require("../spatialAudio");
const {
  createRoomRouter,
  validateRoomConfiguration,
} = require("../roomApi");

function createAudioContext({ stereo = true } = {}) {
  const nodes = [];
  function createNode(parameters = {}) {
    const node = {
      ...parameters,
      connections: [],
      disconnect() {
        this.disconnected = true;
      },
      connect(target) {
        this.connections.push(target);
      },
    };
    nodes.push(node);
    return node;
  }

  return {
    nodes,
    destination: {},
    currentTime: 10,
    createMediaStreamSource: () => createNode(),
    createGain: () =>
      createNode({
        gain: {
          value: 1,
          setTargetAtTime(value, time, duration) {
            this.target = { value, time, duration };
          },
        },
      }),
    createStereoPanner: stereo
      ? () =>
          createNode({
            pan: {
              value: 0,
              setTargetAtTime(value, time, duration) {
                this.target = { value, time, duration };
              },
            },
          })
      : undefined,
    createPanner: () =>
      createNode({
        positionX: { value: 0 },
        positionY: { value: 0 },
        positionZ: { value: 0 },
      }),
  };
}

function validConfiguration() {
  return {
    layout: { width: 20, height: 15 },
    furniture: [{ id: "table", type: "table", x: 4, y: 5, width: 2, height: 1 }],
    obstacles: [
      {
        id: "wall",
        type: "wall",
        x: 10,
        y: 5,
        width: 1,
        height: 8,
        attenuation: 0.2,
      },
    ],
  };
}

test("distance gain is linear, clamped, and validates inputs", () => {
  assert.equal(calculateDistanceGain(0, 50), 1);
  assert.equal(calculateDistanceGain(25, 50), 0.5);
  assert.equal(calculateDistanceGain(50, 50), 0);
  assert.equal(calculateDistanceGain(100, 50), 0);
  assert.throws(() => calculateDistanceGain(-1, 50), RangeError);
});

test("audio follows relative position with smooth stereo pan and distance gain", () => {
  const context = createAudioContext();
  const audio = createSpatialAudio({ audioContext: context, maxDistance: 20 });
  const { gain, panner } = audio.attach("peer", { id: "remote-stream" });

  const result = audio.updatePeer("peer", {
    localPosition: { x: 5, y: 4 },
    remotePosition: { x: 15, y: 7 },
  });

  assert.equal(result.pan, 0.5);
  assert.equal(result.blocked, false);
  assert.equal(gain.gain.target.value, 1 - Math.hypot(10, 3) / 20);
  assert.equal(panner.pan.target.value, 0.5);
  assert.equal(gain.gain.target.duration, 0.12);
  audio.close();
  assert.equal(context.nodes.every((node) => node.disconnected), true);
});

test("blocked voices are attenuated and PannerNode is supported as fallback", () => {
  const context = createAudioContext({ stereo: false });
  const audio = createSpatialAudio({ audioContext: context, obstructionGain: 0.25 });
  audio.attach("peer", { id: "remote-stream" });

  const result = audio.updatePeer("peer", {
    localPosition: { x: 0, y: 0 },
    remotePosition: { x: 10, y: 0 },
    obstacles: [{ x: 5, y: 0, width: 1, height: 4 }],
  });

  assert.equal(result.blocked, true);
  assert.equal(result.gain, 0.25 * 0.8);
  assert.equal(context.nodes[2].positionX.value, 0.2);
  assert.equal(segmentIntersectsRectangle(
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 5, y: 0, width: 1, height: 4 }
  ), true);
  audio.close();
});

test("rotated obstacles and their configured attenuation affect the audio", () => {
  const context = createAudioContext();
  const audio = createSpatialAudio({ audioContext: context });
  const { gain } = audio.attach("peer", { id: "remote-stream" });

  const result = audio.updatePeer("peer", {
    localPosition: { x: 0, y: 0 },
    remotePosition: { x: 10, y: 0 },
    obstacles: [
      { x: 5, y: 1.5, width: 4, height: 1, rotation: 45, attenuation: 0.2 },
    ],
  });

  assert.equal(result.blocked, true);
  assert.equal(result.gain, 0.2 * 0.8);
  assert.equal(gain.gain.target.value, result.gain);
  audio.close();
});

test("furniture between avatars attenuates audio", () => {
  const context = createAudioContext();
  const audio = createSpatialAudio({ audioContext: context, obstructionGain: 0.4 });
  audio.attach("peer", { id: "remote-stream" });

  const result = audio.updatePeer("peer", {
    localPosition: { x: 0, y: 0 },
    remotePosition: { x: 10, y: 0 },
    furniture: [{ x: 5, y: 0, width: 2, height: 2 }],
  });

  assert.equal(result.blocked, true);
  assert.equal(result.gain, 0.4 * 0.8);
  audio.close();
});

test("room configuration validates layouts and unique rectangular entities", () => {
  const configuration = validConfiguration();
  assert.equal(validateRoomConfiguration(configuration), true);
  assert.equal(
    validateRoomConfiguration({
      ...configuration,
      furniture: [configuration.furniture[0], configuration.furniture[0]],
    }),
    false
  );
  assert.equal(
    validateRoomConfiguration({
      ...configuration,
      obstacles: [{ ...configuration.obstacles[0], attenuation: 1.5 }],
    }),
    false
  );
});

test("room router saves and loads configurations through the injected model", async () => {
  const routes = new Map();
  const router = {
    get(path, handler) {
      routes.set(`GET ${path}`, handler);
    },
    put(path, handler) {
      routes.set(`PUT ${path}`, handler);
    },
  };
  const saved = [];
  const roomModel = {
    findOne(query) {
      return {
        select() {
          return {
            lean: async () => saved.find((room) => room.roomId === query.roomId) || null,
          };
        },
      };
    },
    findOneAndUpdate(query, update) {
      const room = { roomId: query.roomId, ...update.$set };
      saved.push(room);
      return {
        select() {
          return { lean: async () => room };
        },
      };
    },
  };
  createRoomRouter({
    express: { Router: () => router },
    Room: roomModel,
  });

  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  await routes.get("PUT /:roomId")(
    { params: { roomId: "lounge" }, body: validConfiguration() },
    response,
    (error) => {
      throw error;
    }
  );
  assert.equal(response.payload.roomId, "lounge");
  assert.deepEqual(response.payload.obstacles, validConfiguration().obstacles);

  await routes.get("GET /:roomId")(
    { params: { roomId: "lounge" } },
    response,
    (error) => {
      throw error;
    }
  );
  assert.equal(response.payload.layout.width, 20);
});
