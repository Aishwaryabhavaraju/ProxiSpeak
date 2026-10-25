import React, { useState } from "react";
import "../styles/Login.css";

function Login({ onJoin }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    if (isJoining) return;

    const trimmed = username.trim();
    if (!trimmed) {
      setError("Please enter a valid display name (cannot be empty or spaces only).");
      return;
    }
    if (trimmed.length > 30) {
      setError("Display name must be 30 characters or fewer.");
      return;
    }

    setError("");
    setIsJoining(true);
    setTimeout(() => {
      onJoin(trimmed);
    }, 150);
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit} noValidate>
        <div className="login-brand-badge">Geospatial Proximity Audio</div>
        <h1>Welcome to ProxiSpeak</h1>
        <p className="login-subtitle">Walk closer. Talk naturally.</p>

        <div className="login-field-group">
          <label htmlFor="proxispeak-username" className="login-field-label">
            <span>Display Name</span>
            <span className="login-char-count">{username.length}/30</span>
          </label>
          <input
            id="proxispeak-username"
            type="text"
            placeholder="Enter your name (e.g., Sankalpa)"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value.slice(0, 30));
              if (error) setError("");
            }}
            maxLength={30}
            autoComplete="off"
            disabled={isJoining}
            aria-invalid={Boolean(error)}
          />
        </div>

        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="login-submit-btn" disabled={isJoining}>
          {isJoining ? "Joining Virtual Office..." : "Join Virtual Office"}
        </button>
      </form>
    </main>
  );
}

export default Login;
