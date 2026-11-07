function createPeerMesh({
  socket,
  localStream,
  rtcConfiguration,
  onTrack = () => {},
  onPeerClosed = () => {},
  onError = console.error,
  createPeerConnection = (configuration) => new RTCPeerConnection(configuration),
}) {
  if (!socket) throw new TypeError("socket is required");

  const peers = new Map();
  let closed = false;

  function reportError(error) {
    onError(error);
  }

  function emitSignal(event, peerId, data) {
    socket.emit(event, { to: peerId, data });
  }

  function closePeer(peerId) {
    const peer = peers.get(peerId);
    if (!peer) return;

    peers.delete(peerId);
    peer.connection.onicecandidate = null;
    peer.connection.ontrack = null;
    peer.connection.onconnectionstatechange = null;
    peer.connection.close();
    onPeerClosed(peerId);
  }

  function ensurePeer(peerId) {
    if (closed || !peerId || peerId === socket.id) return null;
    const existing = peers.get(peerId);
    if (existing) return existing;

    const connection = createPeerConnection(rtcConfiguration);
    const peer = { connection, pendingCandidates: [] };
    peers.set(peerId, peer);

    if (localStream) {
      for (const track of localStream.getTracks()) {
        connection.addTrack(track, localStream);
      }
    }

    connection.onicecandidate = ({ candidate }) => {
      if (candidate) emitSignal("signal:ice-candidate", peerId, candidate.toJSON());
    };
    connection.ontrack = (event) => {
      onTrack({ peerId, stream: event.streams[0], event });
    };

    const shouldInitiate =
      typeof socket.id === "string" && socket.id < peerId;
    if (shouldInitiate) {
      void connection
        .createOffer()
        .then((offer) => connection.setLocalDescription(offer).then(() => offer))
        .then((offer) => emitSignal("signal:offer", peerId, offer))
        .catch(reportError);
    }

    return peer;
  }

  async function applyPendingCandidates(peer) {
    const candidates = peer.pendingCandidates.splice(0);
    for (const candidate of candidates) {
      await peer.connection.addIceCandidate(candidate);
    }
  }

  async function handleOffer({ from, data }) {
    const peer = ensurePeer(from);
    if (!peer) return;

    await peer.connection.setRemoteDescription(data);
    await applyPendingCandidates(peer);
    const answer = await peer.connection.createAnswer();
    await peer.connection.setLocalDescription(answer);
    emitSignal("signal:answer", from, answer);
  }

  async function handleAnswer({ from, data }) {
    const peer = peers.get(from);
    if (!peer) return;
    await peer.connection.setRemoteDescription(data);
    await applyPendingCandidates(peer);
  }

  async function handleCandidate({ from, data }) {
    const peer = ensurePeer(from);
    if (!peer) return;

    if (peer.connection.remoteDescription) {
      await peer.connection.addIceCandidate(data);
    } else {
      peer.pendingCandidates.push(data);
    }
  }

  function safelyHandle(handler) {
    return (payload) => {
      void handler(payload).catch(reportError);
    };
  }

  const handlers = {
    "room:peers": ({ peers: peerIds = [] } = {}) => {
      for (const peerId of peerIds) ensurePeer(peerId);
    },
    "peer:joined": ({ peerId } = {}) => ensurePeer(peerId),
    "peer:left": ({ peerId } = {}) => closePeer(peerId),
    "signal:offer": safelyHandle(handleOffer),
    "signal:answer": safelyHandle(handleAnswer),
    "signal:ice-candidate": safelyHandle(handleCandidate),
  };

  for (const [event, handler] of Object.entries(handlers)) {
    socket.on(event, handler);
  }

  return {
    get peerIds() {
      return [...peers.keys()];
    },
    setPeersInRange(peerIds) {
      const inRange = new Set(peerIds);
      for (const peerId of peers.keys()) {
        if (!inRange.has(peerId)) closePeer(peerId);
      }
      for (const peerId of inRange) ensurePeer(peerId);
    },
    closePeer,
    close() {
      if (closed) return;
      closed = true;
      for (const [event, handler] of Object.entries(handlers)) {
        socket.off(event, handler);
      }
      for (const peerId of peers.keys()) closePeer(peerId);
    },
  };
}

module.exports = { createPeerMesh };
