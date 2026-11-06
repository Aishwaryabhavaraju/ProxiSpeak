function calculateDistanceGain(distance, maxDistance) {
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
    throw new RangeError("maxDistance must be a positive finite number");
  }
  if (!Number.isFinite(distance) || distance < 0) {
    throw new RangeError("distance must be a non-negative finite number");
  }
  return Math.max(0, Math.min(1, 1 - distance / maxDistance));
}

function hasFinitePosition(position) {
  return (
    position !== null &&
    typeof position === "object" &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y)
  );
}

function segmentIntersectsRectangle(start, end, rectangle) {
  const radians = ((rectangle.rotation || 0) * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const transform = (point) => {
    const offsetX = point.x - rectangle.x;
    const offsetY = point.y - rectangle.y;
    return {
      x: offsetX * cosine + offsetY * sine + rectangle.width / 2,
      y: -offsetX * sine + offsetY * cosine + rectangle.height / 2,
    };
  };
  const localStart = transform(start);
  const localEnd = transform(end);
  const deltaX = localEnd.x - localStart.x;
  const deltaY = localEnd.y - localStart.y;
  let minimum = 0;
  let maximum = 1;

  for (const [direction, offset] of [
    [-deltaX, localStart.x],
    [deltaX, rectangle.width - localStart.x],
    [-deltaY, localStart.y],
    [deltaY, rectangle.height - localStart.y],
  ]) {
    if (direction === 0) {
      if (offset < 0) return false;
      continue;
    }

    const intersection = offset / direction;
    if (direction < 0) minimum = Math.max(minimum, intersection);
    else maximum = Math.min(maximum, intersection);
    if (minimum > maximum) return false;
  }

  return true;
}

function setAudioParam(parameter, value, audioContext, smoothingTime) {
  if (typeof parameter.setTargetAtTime === "function") {
    parameter.setTargetAtTime(value, audioContext.currentTime, smoothingTime);
  } else {
    parameter.value = value;
  }
}

function createSpatialAudio({
  audioContext,
  maxDistance = 50,
  smoothingTime = 0.12,
  obstructionGain = 0.35,
} = {}) {
  if (!audioContext) throw new TypeError("audioContext is required");
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
    throw new RangeError("maxDistance must be a positive finite number");
  }
  if (!Number.isFinite(smoothingTime) || smoothingTime <= 0) {
    throw new RangeError("smoothingTime must be a positive finite number");
  }
  if (
    !Number.isFinite(obstructionGain) ||
    obstructionGain < 0 ||
    obstructionGain > 1
  ) {
    throw new RangeError("obstructionGain must be between 0 and 1");
  }

  const peers = new Map();

  function detach(peerId) {
    const peer = peers.get(peerId);
    if (!peer) return;

    peers.delete(peerId);
    peer.source.disconnect();
    peer.gain.disconnect();
    peer.panner.disconnect();
  }

  function updatePeer(
    peerId,
    { localPosition, remotePosition, obstacles = [], furniture = [] }
  ) {
    const peer = peers.get(peerId);
    if (!peer) return false;
    if (!hasFinitePosition(localPosition) || !hasFinitePosition(remotePosition)) {
      throw new TypeError("localPosition and remotePosition need finite x and y values");
    }
    if (!Array.isArray(obstacles)) throw new TypeError("obstacles must be an array");
    if (!Array.isArray(furniture)) throw new TypeError("furniture must be an array");

    const deltaX = remotePosition.x - localPosition.x;
    const deltaY = remotePosition.y - localPosition.y;
    const distance = Math.hypot(deltaX, deltaY);
    const blockingObstacles = [...obstacles, ...furniture].filter(
      (obstacle) =>
        obstacle &&
        Number.isFinite(obstacle.x) &&
        Number.isFinite(obstacle.y) &&
        Number.isFinite(obstacle.width) &&
        obstacle.width > 0 &&
        Number.isFinite(obstacle.height) &&
        obstacle.height > 0 &&
        (obstacle.rotation === undefined ||
          Number.isFinite(obstacle.rotation)) &&
        (obstacle.attenuation === undefined ||
          (Number.isFinite(obstacle.attenuation) &&
            obstacle.attenuation >= 0 &&
            obstacle.attenuation <= 1)) &&
        segmentIntersectsRectangle(localPosition, remotePosition, obstacle)
    );
    const attenuation = blockingObstacles.reduce(
      (gain, obstacle) =>
        gain *
        (obstacle.attenuation === undefined
          ? obstructionGain
          : obstacle.attenuation),
      1
    );
    const blocked = blockingObstacles.length > 0;
    const pan = Math.max(-1, Math.min(1, deltaX / maxDistance));
    const gain = calculateDistanceGain(distance, maxDistance) * attenuation;

    setAudioParam(peer.gain.gain, gain, audioContext, smoothingTime);
    if (peer.panner.pan) {
      setAudioParam(peer.panner.pan, pan, audioContext, smoothingTime);
    } else {
      setAudioParam(peer.panner.positionX, pan, audioContext, smoothingTime);
      setAudioParam(peer.panner.positionY, 0, audioContext, smoothingTime);
      setAudioParam(peer.panner.positionZ, 1, audioContext, smoothingTime);
    }

    return { distance, gain, pan, blocked };
  }

  return {
    attach(peerId, stream) {
      if (!peerId || !stream) throw new TypeError("peerId and stream are required");
      detach(peerId);

      const source = audioContext.createMediaStreamSource(stream);
      const gain = audioContext.createGain();
      const panner = audioContext.createStereoPanner
        ? audioContext.createStereoPanner()
        : audioContext.createPanner();

      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(panner);
      panner.connect(audioContext.destination);
      peers.set(peerId, { source, gain, panner });
      return { gain, panner };
    },
    updatePeer,
    setDistance(peerId, distance, blocked = false) {
      const peer = peers.get(peerId);
      if (!peer) return false;

      const gain =
        calculateDistanceGain(distance, maxDistance) *
        (blocked ? obstructionGain : 1);
      setAudioParam(peer.gain.gain, gain, audioContext, smoothingTime);
      return true;
    },
    detach,
    close() {
      for (const peerId of peers.keys()) detach(peerId);
    },
  };
}

module.exports = {
  calculateDistanceGain,
  createSpatialAudio,
  segmentIntersectsRectangle,
};
