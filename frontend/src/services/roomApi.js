
const STORAGE_KEY = "proxispeak_rooms";

function getRooms() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRooms(rooms) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
}

export async function createRoom() {
  const rooms = getRooms();
  let roomId;

  do {
    roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  } while (rooms.includes(roomId));

  rooms.push(roomId);
  saveRooms(rooms);

  return { roomId };
}

export async function validateRoom(roomId) {
  const rooms = getRooms();
  const normalizedId = roomId.trim().toUpperCase();

  if (!rooms.includes(normalizedId)) {
    throw new Error("Room not found. Please create a room first.");
  }

  return { roomId: normalizedId };
}
