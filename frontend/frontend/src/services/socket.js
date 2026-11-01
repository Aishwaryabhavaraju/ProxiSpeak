import { io } from "socket.io-client";

const SERVER_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_SOCKET_URL) ||
  "http://localhost:5000";

export const socket = io(SERVER_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,       // was 5 — more retries for mobile/poor networks
  reconnectionDelay: 1000,        // was 1500 — start retrying sooner
  reconnectionDelayMax: 5000,     // cap exponential backoff at 5s
  timeout: 8000,                  // was 4000 — allow more time on slow networks
});

export function getConfiguredServerUrl() {
  return SERVER_URL;
}
