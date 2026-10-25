
import React, { useState } from "react";
import { createRoom, validateRoom } from "../services/roomApi";
import "../styles/Login.css";

function Login({ onJoin }) {
  const [screen, setScreen] = useState("home");
  const [username, setUsername] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [createdRoomId, setCreatedRoomId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  function validateUsername() {
    const name = username.trim();

    if (!name) {
      setError("Please enter a display name.");
      return null;
    }

    if (name.length > 30) {
      setError("Display name must be 30 characters or fewer.");
      return null;
    }

    return name;
  }

  async function handleCreateRoom(event) {
    event.preventDefault();
    setError("");

    const name = validateUsername();
    if (!name) return;

    setLoading(true);

    try {
    const { roomId } = await createRoom(name);
      setCreatedRoomId(roomId);
      setScreen("created");
    } catch (err) {
      setError(err.message || "Couldn't create a room. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinRoom(event) {
    event.preventDefault();
    setError("");

    const name = validateUsername();
    if (!name) return;

    const roomId = roomInput.trim();

    if (!roomId) {
      setError("Please enter a room ID.");
      return;
    }

    setLoading(true);

    try {
      const { roomId: validRoomId } = await validateRoom(roomId);
onJoin(name, validRoomId, "join");
    } catch (err) {
      setError(err.message || "Couldn't join that room. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyRoomId() {
    try {
      await navigator.clipboard.writeText(createdRoomId);
      setCopied(true);
    } catch {
      setError("Couldn't copy automatically. Please select and copy the room ID.");
    }
  }

  function openScreen(nextScreen) {
    setError("");
    setCopied(false);
    setScreen(nextScreen);
  }

  function backHome() {
    setError("");
    setLoading(false);
    setScreen("home");
  }

  function enterCreatedRoom() {
    const name = validateUsername();
    if (!name || !createdRoomId) return;
    onJoin(name, createdRoomId, "create");
  }

  return (
    <main className="login-page">
      <div className="login-glow login-glow-one" aria-hidden="true" />
      <div className="login-glow login-glow-two" aria-hidden="true" />

      <section className="login-container">
        <div className="login-brand">
          <div className="login-brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span>ProxiSpeak</span>
        </div>

        <div className="login-heading">
          <div className="login-eyebrow">YOUR SPACE. YOUR PEOPLE.</div>
          <h1>
            Work feels better
            <br />
            <span>closer together.</span>
          </h1>
          <p>
            Step into a virtual office where conversations happen naturally
            as you move closer.
          </p>
        </div>

        {screen === "home" && (
          <div className="room-choice-grid">
            <button
              type="button"
              className="room-choice-card room-choice-primary"
              onClick={() => openScreen("create")}
            >
              <span className="room-choice-icon" aria-hidden="true">＋</span>
              <span className="room-choice-title">Create a Room</span>
              <span className="room-choice-description">
                Start a new space and invite your team with a room ID.
              </span>
              <span className="room-choice-action">
                Create room <span aria-hidden="true">→</span>
              </span>
            </button>

            <button
              type="button"
              className="room-choice-card"
              onClick={() => openScreen("join")}
            >
              <span className="room-choice-icon room-choice-icon-join" aria-hidden="true">
                ↗
              </span>
              <span className="room-choice-title">Join a Room</span>
              <span className="room-choice-description">
                Have a room ID already? Enter it to join your colleagues.
              </span>
              <span className="room-choice-action">
                Join room <span aria-hidden="true">→</span>
              </span>
            </button>
          </div>
        )}

        {(screen === "create" || screen === "join") && (
          <form
            className="login-card"
            onSubmit={screen === "create" ? handleCreateRoom : handleJoinRoom}
          >
            <button
              type="button"
              className="login-back-button"
              onClick={backHome}
              disabled={loading}
            >
              <span aria-hidden="true">←</span> Back
            </button>

            <div className="login-card-heading">
              <span className="login-card-kicker">
                {screen === "create" ? "START SOMETHING NEW" : "COME ON IN"}
              </span>
              <h2>{screen === "create" ? "Create your room" : "Join your team"}</h2>
              <p>
                {screen === "create"
                  ? "Choose your display name to create a virtual space."
                  : "Enter your name and the room ID shared with you."}
              </p>
            </div>

            <label className="login-field-label" htmlFor="proxispeak-username">
              Display name
            </label>
            <input
              id="proxispeak-username"
              className="login-input"
              type="text"
              placeholder="e.g. Sowmya"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value.slice(0, 30));
                setError("");
              }}
              maxLength={30}
              autoComplete="nickname"
              disabled={loading}
              required
            />
            <div className="login-input-meta">{username.length}/30 characters</div>

            {screen === "join" && (
              <>
                <label className="login-field-label" htmlFor="proxispeak-room-id">
                  Room ID
                </label>
                <input
                  id="proxispeak-room-id"
                  className="login-input"
                  type="text"
                  placeholder="Paste your room ID"
                  value={roomInput}
                  onChange={(event) => {
                    setRoomInput(event.target.value);
                    setError("");
                  }}
                  autoComplete="off"
                  spellCheck="false"
                  disabled={loading}
                  required
                />
              </>
            )}

            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <button
              className="login-submit-btn"
              type="submit"
              disabled={loading}
            >
              {loading
                ? screen === "create"
                  ? "Creating room..."
                  : "Checking room..."
                : screen === "create"
                  ? "Create room"
                  : "Find and join room"}
              {!loading && <span aria-hidden="true"> →</span>}
            </button>

            {loading && (
              <p className="login-loading-note" role="status">
                Please wait while we contact the room service.
              </p>
            )}
          </form>
        )}

        {screen === "created" && (
          <div className="login-card room-created-card">
            <div className="room-created-check" aria-hidden="true">✓</div>
            <div className="login-card-heading">
              <span className="login-card-kicker">ROOM READY</span>
              <h2>Your room ID</h2>
              <p>Share this ID with your teammates so they can find your room.</p>
            </div>

            <div className="room-id-display">
              <code>{createdRoomId}</code>
              <button
                type="button"
                className="room-copy-button"
                onClick={handleCopyRoomId}
                aria-label="Copy room ID"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>

            {error && (
              <div className="login-error" role="alert">{error}</div>
            )}

            <button
              type="button"
              className="login-submit-btn"
              onClick={enterCreatedRoom}
            >
              Enter virtual office <span aria-hidden="true">→</span>
            </button>

            <button
              type="button"
              className="login-secondary-btn"
              onClick={backHome}
            >
              Back to room options
            </button>
          </div>
        )}

        <p className="login-footer">
          <span className="login-footer-dot" />
          ProxiSpeak · Conversations, in closer proximity
        </p>
      </section>
    </main>
  );
}

export default Login;
