const API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_URL) ||
  "http://localhost:5000";

const STORAGE_KEY = "proxispeak_rooms";

function getLocalRooms() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalRoom(roomId, name = "General Office") {
  const rooms = getLocalRooms();
  const existing = rooms.find((r) => (typeof r === "string" ? r === roomId : r.roomId === roomId));
  if (!existing) {
    rooms.unshift({ roomId, name, createdAt: new Date().toISOString() });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms.slice(0, 20)));
    } catch (_) {}
  }
}

export async function createRoom(payload = {}) {
  const roomName = typeof payload === "string" ? payload : payload.name || "Main Workspace";
  const description = payload.description || "";
  const isPrivate = Boolean(payload.isPrivate);
  const creatorId = payload.creatorId || "user";
  const creatorName = payload.creatorName || "Workspace Member";

  try {
    const res = await fetch(`${API_BASE}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: roomName,
        description,
        isPrivate,
        creatorId,
        creatorName,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.room) {
        saveLocalRoom(data.room.roomId, data.room.name);
        return data.room;
      }
    }
  } catch (err) {
    console.warn("Backend room creation unreachable, creating local room:", err.message);
  }

  // Fallback to local room code generation
  const localId = Math.random().toString(36).substring(2, 8).toUpperCase();
  saveLocalRoom(localId, roomName);
  return {
    roomId: localId,
    name: roomName,
    description,
    creatorName,
    createdAt: new Date().toISOString(),
  };
}

export async function validateRoom(roomId) {
  if (!roomId || !roomId.trim()) {
    throw new Error("Please enter a room ID.");
  }
  const normalizedId = roomId.trim().toUpperCase();

  try {
    const res = await fetch(`${API_BASE}/api/rooms/${normalizedId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.room) {
        saveLocalRoom(data.room.roomId, data.room.name);
        return data.room;
      }
    } else if (res.status === 404) {
      throw new Error("Room not found. Please verify the code or create a new workspace.");
    }
  } catch (err) {
    if (err.message.includes("Room not found")) {
      throw err;
    }
    console.warn("Backend room query failed, checking local storage:", err.message);
  }

  // Check local fallback
  const rooms = getLocalRooms();
  const exists = rooms.some((r) =>
    typeof r === "string" ? r === normalizedId : r.roomId === normalizedId
  );
  if (exists) {
    return { roomId: normalizedId, name: `Workspace ${normalizedId}` };
  }

  // If in simulation or offline mode and code is 6 characters, accept it
  if (normalizedId.length >= 4) {
    saveLocalRoom(normalizedId, `Workspace ${normalizedId}`);
    return { roomId: normalizedId, name: `Workspace ${normalizedId}` };
  }

  throw new Error("Room not found. Please create a room first.");
}

export async function listRecentRooms() {
  try {
    const res = await fetch(`${API_BASE}/api/rooms`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.rooms)) {
        return data.rooms;
      }
    }
  } catch (err) {
    console.warn("Failed to fetch public rooms from API:", err.message);
  }

  const local = getLocalRooms();
  return local.map((r) =>
    typeof r === "string" ? { roomId: r, name: `Workspace ${r}` } : r
  );
}
