import React, { useState, useEffect } from "react";
import { createRoom, validateRoom, listRecentRooms } from "../services/roomApi";
import {
  PlusCircle,
  LogIn,
  Layers,
  LogOut,
  Users,
  Compass,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  Radio,
  Building,
} from "lucide-react";
import "../styles/Dashboard.css";

export default function Dashboard({ user, onEnterRoom, onLogout }) {
  const [activeTab, setActiveTab] = useState("create"); // "create" | "join"
  const [roomName, setRoomName] = useState("");
  const [roomDescription, setRoomDescription] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [recentRooms, setRecentRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");

  // Load recent workspaces on mount
  useEffect(() => {
    let mounted = true;
    async function fetchRooms() {
      try {
        const rooms = await listRecentRooms();
        if (mounted && Array.isArray(rooms)) {
          setRecentRooms(rooms);
        }
      } catch (err) {
        console.warn("Could not load recent rooms", err);
      }
    }
    fetchRooms();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleCreateSubmit(e) {
    e.preventDefault();
    setError("");

    if (!roomName.trim()) {
      setError("Please enter a name for your workspace.");
      return;
    }

    setLoading(true);
    try {
      const room = await createRoom({
        name: roomName.trim(),
        description: roomDescription.trim(),
        creatorId: user?.id || user?.username || "user",
        creatorName: user?.name || user?.username || "Member",
      });

      if (room && room.roomId) {
        onEnterRoom({
          roomId: room.roomId,
          name: room.name || roomName.trim(),
          description: room.description || "",
        });
      }
    } catch (err) {
      setError(err.message || "Failed to create workspace. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinSubmit(e) {
    e.preventDefault();
    setError("");

    const code = joinRoomId.trim().toUpperCase();
    if (!code) {
      setError("Please enter a 6-character room code.");
      return;
    }

    setLoading(true);
    try {
      const validated = await validateRoom(code);
      if (validated && validated.roomId) {
        onEnterRoom({
          roomId: validated.roomId,
          name: validated.name || `Workspace ${validated.roomId}`,
          description: validated.description || "",
        });
      }
    } catch (err) {
      setError(err.message || "Room code not recognized. Check the code or create a new room.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(code);
      setTimeout(() => setCopiedId(""), 2000);
    } catch {
      // Ignore copy error
    }
  }

  const userInitial = (user?.name || user?.username || "U").charAt(0).toUpperCase();
  const avatarColor = user?.avatarColor || "#818CF8";

  return (
    <div className="dash-container">
      {/* Top Navbar */}
      <header className="dash-nav">
        <div className="dash-nav-brand">
          <div className="dash-logo-icon">
            <Radio size={20} className="dash-pulse-dot" />
          </div>
          <div>
            <h1 className="dash-brand-title">ProxiSpeak</h1>
            <span className="dash-brand-subtitle">Virtual Workspace Ecosystem</span>
          </div>
        </div>

        {/* User Profile Pill */}
        <div className="dash-user-bar">
          <div className="dash-user-profile">
            <div
              className="dash-user-avatar"
              style={{ backgroundColor: avatarColor }}
            >
              {userInitial}
            </div>
            <div className="dash-user-info">
              <span className="dash-user-name">{user?.name || "Workspace Member"}</span>
              <span className="dash-user-handle">@{user?.username || "online"}</span>
            </div>
          </div>

          <button
            type="button"
            className="dash-logout-btn"
            onClick={onLogout}
            title="Sign out of account"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="dash-main">
        <div className="dash-hero">
          <h2 className="dash-hero-title">Your Virtual Workspace</h2>
          <p className="dash-hero-desc">
            Seamless geospatial voice proximity, natural team interactions, and instant room isolation.
          </p>
        </div>

        {/* Action Tabs */}
        <div className="dash-grid">
          <div className="dash-card dash-action-card">
            <div className="dash-card-tabs">
              <button
                type="button"
                className={`dash-tab-btn ${activeTab === "create" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("create");
                  setError("");
                }}
              >
                <PlusCircle size={18} />
                <span>Create Workspace</span>
              </button>
              <button
                type="button"
                className={`dash-tab-btn ${activeTab === "join" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("join");
                  setError("");
                }}
              >
                <LogIn size={18} />
                <span>Join with Code</span>
              </button>
            </div>

            {error && (
              <div className="dash-alert dash-alert-error" role="alert">
                <span>{error}</span>
              </div>
            )}

            {/* Create Tab */}
            {activeTab === "create" && (
              <form onSubmit={handleCreateSubmit} className="dash-form">
                <div className="dash-field">
                  <label htmlFor="workspace-name" className="dash-label">
                    Workspace Name
                  </label>
                  <input
                    id="workspace-name"
                    type="text"
                    className="dash-input"
                    placeholder="e.g. Core Engineering, Design Lab, Standup"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    maxLength={50}
                    required
                  />
                </div>

                <div className="dash-field">
                  <label htmlFor="workspace-desc" className="dash-label">
                    Description <span className="dash-optional">(optional)</span>
                  </label>
                  <input
                    id="workspace-desc"
                    type="text"
                    className="dash-input"
                    placeholder="Brief description of today's collaborative focus"
                    value={roomDescription}
                    onChange={(e) => setRoomDescription(e.target.value)}
                    maxLength={120}
                  />
                </div>

                <div className="dash-action-footer">
                  <button
                    type="submit"
                    className="dash-submit-btn"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="dash-spinner" />
                    ) : (
                      <>
                        <Sparkles size={18} />
                        <span>Launch & Enter Office</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Join Tab */}
            {activeTab === "join" && (
              <form onSubmit={handleJoinSubmit} className="dash-form">
                <div className="dash-field">
                  <label htmlFor="join-code" className="dash-label">
                    6-Character Room Code
                  </label>
                  <div className="dash-code-input-wrap">
                    <input
                      id="join-code"
                      type="text"
                      className="dash-input dash-code-input"
                      placeholder="e.g. K9MN2B"
                      value={joinRoomId}
                      onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                      maxLength={10}
                      required
                    />
                  </div>
                  <span className="dash-hint">
                    Ask a team member for their workspace code.
                  </span>
                </div>

                <div className="dash-action-footer">
                  <button
                    type="submit"
                    className="dash-submit-btn dash-join-btn"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="dash-spinner" />
                    ) : (
                      <>
                        <span>Join Workspace</span>
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Quick Guide & Features Card */}
          <div className="dash-card dash-info-card">
            <h3 className="dash-info-title">
              <Compass size={20} className="dash-info-icon" />
              Spatial Audio Highlights
            </h3>
            <ul className="dash-feature-list">
              <li className="dash-feature-item">
                <span className="dash-feature-dot teal" />
                <div>
                  <strong>100px Earshot Radius</strong>
                  <p>Speak naturally with colleagues within 100 pixels. Audio volume drops smoothly with distance.</p>
                </div>
              </li>
              <li className="dash-feature-item">
                <span className="dash-feature-dot amber" />
                <div>
                  <strong>Approaching Zone (101-200px)</strong>
                  <p>Visual and stereo spatial cues alert you when someone enters conversational range.</p>
                </div>
              </li>
              <li className="dash-feature-item">
                <span className="dash-feature-dot indigo" />
                <div>
                  <strong>Room-Isolated Signaling</strong>
                  <p>Each workspace is private with dedicated Socket.IO signaling, chat messages, and WebRTC audio.</p>
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Recent / Available Workspaces Section */}
        {recentRooms.length > 0 && (
          <div className="dash-recent-section">
            <div className="dash-recent-header">
              <div className="dash-recent-title-wrap">
                <Building size={18} className="dash-recent-icon" />
                <h3 className="dash-recent-title">Active Workspaces</h3>
              </div>
              <span className="dash-recent-count">{recentRooms.length} available</span>
            </div>

            <div className="dash-rooms-grid">
              {recentRooms.map((r) => {
                const id = r.roomId || r;
                const name = r.name || `Workspace ${id}`;
                const creator = r.creatorName || "Team";
                const isCopied = copiedId === id;

                return (
                  <div key={id} className="dash-room-card">
                    <div className="dash-room-top">
                      <h4 className="dash-room-name">{name}</h4>
                      <button
                        type="button"
                        className="dash-room-code-badge"
                        onClick={() => handleCopyCode(id)}
                        title="Copy Room ID"
                      >
                        <code>{id}</code>
                        {isCopied ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>

                    {r.description && (
                      <p className="dash-room-desc">{r.description}</p>
                    )}

                    <div className="dash-room-bottom">
                      <span className="dash-room-creator">By {creator}</span>
                      <button
                        type="button"
                        className="dash-room-enter-btn"
                        onClick={() =>
                          onEnterRoom({
                            roomId: id,
                            name,
                            description: r.description || "",
                          })
                        }
                      >
                        <span>Enter</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

