import React, { useState } from "react";
import { Users, Mic, MicOff, Volume2, VolumeX, MessageSquare, Hand, Monitor, Sliders } from "lucide-react";
import "../styles/UserList.css";

export default function UserList({
  localUser,
  remoteUsers = [],
  spatialMetrics = {},
  onSelectDM,
  onPeerVolumeChange,
  peerVolumes = {},
}) {
  const totalCount = (localUser ? 1 : 0) + remoteUsers.length;
  const [activeVolumePeerId, setActiveVolumePeerId] = useState(null);

  return (
    <section className="userlist-panel" aria-label="People in Workspace">
      <div className="userlist-header">
        <div className="userlist-title-wrap">
          <Users size={16} className="userlist-icon" />
          <h3 className="userlist-title">Colleagues in Office</h3>
        </div>
        <span className="userlist-count-badge">{totalCount} online</span>
      </div>

      <div className="userlist-items">
        {/* Local User Card */}
        {localUser && (
          <div className="user-card local">
            <div className="user-card-left">
              <div
                className="user-badge-initial"
                style={{ backgroundColor: localUser.color || "#818CF8" }}
              >
                {(localUser.username || "Y").charAt(0).toUpperCase()}
              </div>
              <div className="user-card-names">
                <span className="user-card-name">
                  {localUser.username || "You"} <span className="user-you-tag">(You)</span>
                  {localUser.handRaised && <span className="user-hand-icon">✋</span>}
                  {localUser.isSharingScreen && <Monitor size={12} className="user-screen-icon" />}
                </span>
                <span className="user-card-sub">Local Station</span>
              </div>
            </div>
            <div className="user-card-right">
              {localUser.muted ? (
                <span className="user-mic-pill muted" title="Microphone muted">
                  <MicOff size={13} />
                </span>
              ) : (
                <span className="user-mic-pill active" title="Microphone active">
                  <Mic size={13} />
                </span>
              )}
            </div>
          </div>
        )}

        {/* Remote Users */}
        {remoteUsers.length === 0 ? (
          <div className="userlist-empty">
            <p>No other colleagues in this office yet.</p>
            <span>Share your Room Code to collaborate!</span>
          </div>
        ) : (
          remoteUsers.map((user) => {
            const metric = spatialMetrics ? spatialMetrics[user.id] : null;
            const dist = metric
              ? metric.distance
              : Math.round(
                  Math.hypot(
                    (user.x || 0) - (localUser?.x || 0),
                    (user.y || 0) - (localUser?.y || 0)
                  )
                );
            const gainPct = metric
              ? Math.round(metric.gain * 100)
              : dist <= 100
              ? 100
              : 0;

            let proximityTag = { label: "Out of Range", class: "out" };
            if (dist <= 100) {
              proximityTag = { label: "In Earshot", class: "in-earshot" };
            } else if (dist <= 200) {
              proximityTag = { label: "Approaching", class: "approaching" };
            }

            const currentPeerVol = peerVolumes[user.id] !== undefined ? peerVolumes[user.id] : 1.0;
            const isShowingSlider = activeVolumePeerId === user.id;

            return (
              <div key={user.id} className="user-card-container">
                <div className="user-card">
                  <div className="user-card-left">
                    <div
                      className="user-badge-initial"
                      style={{ backgroundColor: user.color || "#5EEAD4" }}
                    >
                      {(user.username || "U").charAt(0).toUpperCase()}
                    </div>
                    <div className="user-card-names">
                      <span className="user-card-name">
                        {user.username}
                        {user.handRaised && <span className="user-hand-icon">✋</span>}
                        {user.isSharingScreen && <Monitor size={12} className="user-screen-icon" />}
                      </span>
                      <div className="user-dist-row">
                        <span className="user-dist-px">{dist}px</span>
                        {dist <= 100 && (
                          <span className="user-vol-pct">Vol: {gainPct}%</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="user-card-right">
                    <span className={`user-prox-badge ${proximityTag.class}`}>
                      {proximityTag.label}
                    </span>

                    {/* Individual volume slider toggle */}
                    <button
                      type="button"
                      className={`user-action-btn ${isShowingSlider ? "active" : ""}`}
                      onClick={() =>
                        setActiveVolumePeerId(isShowingSlider ? null : user.id)
                      }
                      title={`Adjust volume for ${user.username} (${Math.round(currentPeerVol * 100)}%)`}
                    >
                      <Sliders size={13} />
                    </button>

                    {/* Direct message shortcut */}
                    {onSelectDM && (
                      <button
                        type="button"
                        className="user-action-btn"
                        onClick={() => onSelectDM(user)}
                        title={`Direct message ${user.username}`}
                      >
                        <MessageSquare size={13} />
                      </button>
                    )}

                    {user.muted ? (
                      <span className="user-mic-pill muted" title="Muted">
                        <MicOff size={13} />
                      </span>
                    ) : (
                      <span className="user-mic-pill active" title="Audio on">
                        <Mic size={13} />
                      </span>
                    )}
                  </div>
                </div>

                {/* Dropdown slider for individual volume adjustment */}
                {isShowingSlider && (
                  <div className="user-individual-volume-bar">
                    <span className="individual-vol-label">Volume: {Math.round(currentPeerVol * 100)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      step={5}
                      value={Math.round(currentPeerVol * 100)}
                      onChange={(e) => {
                        const val = Number(e.target.value) / 100;
                        if (onPeerVolumeChange) {
                          onPeerVolumeChange(user.id, val);
                        }
                      }}
                      className="individual-vol-slider"
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
