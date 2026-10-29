const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { io: createSocketClient } = require("socket.io-client");
const { createSignalingServer } = require("../src/services/signaling");

function waitFor(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 3000);
    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

test("room peers exchange WebRTC signaling only within their room", async (t) => {
  const httpServer = http.createServer();
  const signaling = await createSignalingServer(httpServer, { redisUrl: null });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  const endpoint = `http://127.0.0.1:${address.port}`;
  const first = createSocketClient(endpoint);
  const second = createSocketClient(endpoint);
  const outsider = createSocketClient(endpoint);
  t.after(async () => {
    first.disconnect();
    second.disconnect();
    outsider.disconnect();
    await signaling.close();
  });

  await Promise.all([
    waitFor(first, "connect"),
    waitFor(second, "connect"),
    waitFor(outsider, "connect"),
  ]);
  const firstPeers = waitFor(first, "room:peers");
  first.emit("room:join", { roomId: "room-a" });
  assert.deepEqual((await firstPeers).peers, []);

  const joined = waitFor(first, "peer:joined");
  const secondPeers = waitFor(second, "room:peers");
  second.emit("room:join", { roomId: "room-a" });
  assert.deepEqual((await secondPeers).peers, [first.id]);
  assert.deepEqual(await joined, { peerId: second.id });

  const outsiderPeers = waitFor(outsider, "room:peers");
  outsider.emit("room:join", { roomId: "room-b" });
  assert.deepEqual((await outsiderPeers).peers, []);

  const receivedOffer = waitFor(second, "signal:offer");
  first.emit("signal:offer", {
    to: second.id,
    data: { type: "offer", sdp: "test-offer" },
  });
  assert.deepEqual(await receivedOffer, {
    from: first.id,
    data: { type: "offer", sdp: "test-offer" },
  });

  const receivedAnswer = waitFor(first, "signal:answer");
  second.emit("signal:answer", {
    to: first.id,
    data: { type: "answer", sdp: "test-answer" },
  });
  assert.deepEqual(await receivedAnswer, {
    from: second.id,
    data: { type: "answer", sdp: "test-answer" },
  });

  const receivedCandidate = waitFor(second, "signal:ice-candidate");
  first.emit("signal:ice-candidate", {
    to: second.id,
    data: { candidate: "candidate:test", sdpMid: "0", sdpMLineIndex: 0 },
  });
  assert.deepEqual(await receivedCandidate, {
    from: first.id,
    data: { candidate: "candidate:test", sdpMid: "0", sdpMLineIndex: 0 },
  });

  const signalingError = waitFor(outsider, "signaling:error");
  outsider.emit("signal:offer", {
    to: first.id,
    data: { type: "offer", sdp: "not-in-room" },
  });
  assert.match((await signalingError).message, /same room/);
});
