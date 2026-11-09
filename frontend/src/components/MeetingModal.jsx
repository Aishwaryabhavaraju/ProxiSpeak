import React, { useState, useEffect } from "react";
import { Calendar, Clock, X, Plus, Trash2, ArrowRight, Video } from "lucide-react";
import { API_BASE_URL } from "../services/authApi";
import "../styles/MeetingModal.css";

export default function MeetingModal({
  isOpen,
  onClose,
  currentRoomId = "MAIN-OFFICE",
  currentUser,
  onJoinRoom,
}) {
  const [activeTab, setActiveTab] = useState("upcoming"); // "upcoming" | "create"
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Form states
  const todayStr = new Date().toISOString().split("T")[0];
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayStr);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("10:30");
  const [roomId, setRoomId] = useState(currentRoomId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchUpcomingMeetings();
      setRoomId(currentRoomId);
    }
  }, [isOpen, currentRoomId]);

  async function fetchUpcomingMeetings() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/meetings/upcoming`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setMeetings(data.data);
        }
      }
    } catch (err) {
      setError("Failed to load meetings.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSchedule(e) {
    e.preventDefault();
    if (!title.trim() || !date || !startTime || !endTime || !roomId) {
      setError("Please fill in all required fields.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          date,
          startTime,
          endTime,
          roomId: roomId.trim().toUpperCase(),
          createdBy: currentUser?.username || "Host",
          creatorName: currentUser?.username || "Host",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to schedule meeting");
      }

      // Reset form & reload upcoming meetings
      setTitle("");
      setDescription("");
      setActiveTab("upcoming");
      fetchUpcomingMeetings();
    } catch (err) {
      setError(err.message || "Failed to schedule meeting.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelMeeting(id) {
    try {
      const res = await fetch(`${API_BASE_URL}/meetings/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMeetings((prev) => prev.filter((m) => m._id !== id));
      }
    } catch (err) {
      console.warn("Error deleting meeting:", err);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="meeting-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="meeting-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="meeting-modal-header">
          <div className="meeting-modal-title">
            <Calendar size={18} className="meeting-header-icon" />
            <span>Meeting Scheduler</span>
          </div>
          <button type="button" className="meeting-modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="meeting-tab-bar">
          <button
            type="button"
            className={`meeting-tab-btn ${activeTab === "upcoming" ? "active" : ""}`}
            onClick={() => setActiveTab("upcoming")}
          >
            <Clock size={14} />
            <span>Upcoming Meetings</span>
            {meetings.length > 0 && <span className="meeting-tab-badge">{meetings.length}</span>}
          </button>

          <button
            type="button"
            className={`meeting-tab-btn ${activeTab === "create" ? "active" : ""}`}
            onClick={() => setActiveTab("create")}
          >
            <Plus size={14} />
            <span>Schedule New</span>
          </button>
        </div>

        {error && <div className="meeting-error-banner">{error}</div>}

        {/* Body Content */}
        <div className="meeting-modal-body">
          {activeTab === "upcoming" ? (
            <div className="meeting-list">
              {loading ? (
                <div className="meeting-empty-state">Loading meetings...</div>
              ) : meetings.length === 0 ? (
                <div className="meeting-empty-state">
                  <Calendar size={32} className="meeting-empty-icon" />
                  <p>No upcoming meetings scheduled.</p>
                  <span>Click "Schedule New" to organize a team session.</span>
                </div>
              ) : (
                meetings.map((m) => (
                  <div key={m._id} className="meeting-item-card">
                    <div className="meeting-item-info">
                      <div className="meeting-item-header">
                        <span className="meeting-item-title">{m.title}</span>
                        <span className="meeting-item-room-tag">{m.roomId}</span>
                      </div>
                      {m.description && <p className="meeting-item-desc">{m.description}</p>}
                      <div className="meeting-item-meta">
                        <span>📅 {m.date}</span>
                        <span>
                          🕒 {m.startTime} – {m.endTime}
                        </span>
                        <span>👤 {m.creatorName || m.createdBy}</span>
                      </div>
                    </div>
                    <div className="meeting-item-actions">
                      <button
                        type="button"
                        className="meeting-join-btn"
                        onClick={() => {
                          onJoinRoom?.({ roomId: m.roomId, name: m.roomName || m.roomId });
                          onClose();
                        }}
                        title={`Join room ${m.roomId}`}
                      >
                        <Video size={13} />
                        <span>Join</span>
                      </button>
                      {currentUser?.username === m.createdBy && (
                        <button
                          type="button"
                          className="meeting-delete-btn"
                          onClick={() => handleCancelMeeting(m._id)}
                          title="Cancel meeting"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <form onSubmit={handleSchedule} className="meeting-create-form">
              <div className="meeting-form-field">
                <label>Meeting Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Daily Standup or Sprint Planning"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="meeting-form-field">
                <label>Description</label>
                <textarea
                  placeholder="Agenda, notes, or discussion points..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="meeting-form-row">
                <div className="meeting-form-field">
                  <label>Date *</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
                <div className="meeting-form-field">
                  <label>Room ID *</label>
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    required
                  />
                </div>
              </div>

              <div className="meeting-form-row">
                <div className="meeting-form-field">
                  <label>Start Time *</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <div className="meeting-form-field">
                  <label>End Time *</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="meeting-form-actions">
                <button
                  type="button"
                  className="meeting-cancel-btn"
                  onClick={() => setActiveTab("upcoming")}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="meeting-submit-btn"
                  disabled={saving || !title.trim()}
                >
                  {saving ? "Scheduling..." : "Schedule Meeting"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

