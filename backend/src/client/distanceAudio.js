function calculateDistanceGain(distance, maxDistance) {
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
    throw new RangeError("maxDistance must be a positive finite number");
  }
  if (!Number.isFinite(distance) || distance < 0) {
    throw new RangeError("distance must be a non-negative finite number");
  }
  return Math.max(0, Math.min(1, 1 - distance / maxDistance));
}

function createDistanceAudio({ audioContext, maxDistance = 50 }) {
  if (!audioContext) throw new TypeError("audioContext is required");
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
    throw new RangeError("maxDistance must be a positive finite number");
  }

  const peers = new Map();

  function detach(peerId) {
    const peer = peers.get(peerId);
    if (!peer) return;

    peers.delete(peerId);
    peer.source.disconnect();
    peer.gain.disconnect();
  }

  return {
    attach(peerId, stream) {
      if (!peerId || !stream) throw new TypeError("peerId and stream are required");
      detach(peerId);

      const source = audioContext.createMediaStreamSource(stream);
      const gain = audioContext.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(audioContext.destination);
      peers.set(peerId, { source, gain });
      return gain;
    },
    setDistance(peerId, distance) {
      const peer = peers.get(peerId);
      if (!peer) return false;

      peer.gain.gain.value = calculateDistanceGain(distance, maxDistance);
      return true;
    },
    detach,
    close() {
      for (const peerId of peers.keys()) detach(peerId);
    },
  };
}

module.exports = { calculateDistanceGain, createDistanceAudio };
