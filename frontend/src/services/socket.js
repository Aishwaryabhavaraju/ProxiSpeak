import { io } from "socket.io-client";

const SERVER_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_SOCKET_URL) ||
  "http://localhost:3000";

export const socket = io(SERVER_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1500,
  timeout: 4000,
});

export function getConfiguredServerUrl() {
  return SERVER_URL;
}
