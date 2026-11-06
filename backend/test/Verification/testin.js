const assert = require("node:assert/strict");
const test = require("node:test");
const { EventEmitter } = require("node:events");
const {
  calculateDistanceGain,
  createDistanceAudio,
} = require("../src/client/distanceAudio");
const { createPeerMesh } = require("../src/client/peerMesh");

class FakeSocket extends EventEmitter {
  constructor(id) {
    super();
    this.id = id;
    this.sent = [];
  }

  emit(event, ...args) {
    if (event.startsWith("signal:")) {
      this.sent.push({ event, payload: args[0] });
      return true;
    }
    return super.emit(event, ...args);
  }

  receive(event, payload) {
    return super.emit(event, payload);
  }
}

class FakePeerConnection {
  constructor() {
    this.localDescription = null;
    this.remoteDescription = null;
    this.closed = false;
    this.addedTracks = [];
  }

  addTrack(track, stream) {
    this.addedTracks.push({ track, stream });
  }

  async createOffer() {
    return { type: "offer", sdp: "offer" };
  }

  async createAnswer() {
    return { type: "answer", sdp: "answer" };
  }

  async setLocalDescription(description) {
    this.localDescription = description;
  }

  async setRemoteDescription(description) {
    this.remoteDescription = description;
  }

  async addIceCandidate(candidate) {
    this.candidate = candidate;
  }

  close() {
    this.closed = true;
  }
}

test("peer mesh creates one deterministic offer and closes peers out of range", async () => {
  const socket = new FakeSocket("a-peer");
  const connections = [];
  const closedPeers = [];
  const mesh = createPeerMesh({
    socket,
    createPeerConnection: () => {
      const connection = new FakePeerConnection();
      connections.push(connection);
      return connection;
    },
    onPeerClosed: (peerId) => closedPeers.push(peerId),
  });

  socket.emit("room:peers", { peers: ["b-peer"] });
  socket.emit("peer:joined", { peerId: "b-peer" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(connections.length, 1);
  assert.equal(socket.sent.filter(({ event }) => event === "signal:offer").length, 1);

  mesh.setPeersInRange([]);
  assert.deepEqual(mesh.peerIds, []);
  assert.equal(connections[0].closed, true);
  assert.deepEqual(closedPeers, ["b-peer"]);
  mesh.close();
});

test("peer mesh buffers early ICE and answers the remote offer", async () => {
  const socket = new FakeSocket("z-peer");
  const connection = new FakePeerConnection();
  const mesh = createPeerMesh({
    socket,
    createPeerConnection: () => connection,
  });

  socket.receive("signal:ice-candidate", {
    from: "a-peer",
    data: { candidate: "candidate:early" },
  });
  assert.equal(connection.candidate, undefined);

  socket.receive("signal:offer", {
    from: "a-peer",
    data: { type: "offer", sdp: "remote-offer" },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(connection.remoteDescription, {
    type: "offer",
    sdp: "remote-offer",
  });
  assert.deepEqual(connection.candidate, { candidate: "candidate:early" });
  assert.deepEqual(socket.sent.at(-1), {
    event: "signal:answer",
    payload: {
      to: "a-peer",
      data: { type: "answer", sdp: "answer" },
    },
  });
  mesh.close();
});

test("distance audio linearly attenuates and disconnects each remote stream", () => {
  assert.equal(calculateDistanceGain(0, 50), 1);
  assert.equal(calculateDistanceGain(25, 50), 0.5);
  assert.equal(calculateDistanceGain(50, 50), 0);
  assert.equal(calculateDistanceGain(80, 50), 0);

  const disconnected = [];
  const audioContext = {
    destination: {},
    createMediaStreamSource(stream) {
      return {
        stream,
        connect(node) {
          this.connectedTo = node;
        },
        disconnect() {
          disconnected.push("source");
        },
      };
    },
    createGain() {
      return {
        gain: { value: 1 },
        connect(node) {
          this.connectedTo = node;
        },
        disconnect() {
          disconnected.push("gain");
        },
      };
    },
  };
  const audio = createDistanceAudio({ audioContext, maxDistance: 50 });
  const gain = audio.attach("peer", { id: "stream" });
  assert.equal(gain.gain.value, 0);
  assert.equal(audio.setDistance("peer", 10), true);
  assert.equal(gain.gain.value, 0.8);
  audio.close();
  assert.deepEqual(disconnected, ["source", "gain"]);
});
