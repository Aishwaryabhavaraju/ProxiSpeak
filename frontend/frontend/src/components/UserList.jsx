import React from "react";
import { Users, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import "../styles/UserList.css";

export default function UserList({ localUser, remoteUsers = [], spatialMetrics = {} }) {
  const totalCount = (localUser ? 1 : 0) + remoteUsers.length;

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
            const dist = metric ? metric.distance : Math.round(Math.hypot((user.x || 0) - (localUser?.x || 0), (user.y || 0) - (localUser?.y || 0)));
            const gainPct = metric ? Math.round(metric.gain * 100) : (dist <= 100 ? 100 : 0);

            let proximityTag = { label: "Out of Range", class: "out" };
            if (dist <= 100) {
              proximityTag = { label: "In Earshot", class: "in-earshot" };
            } else if (dist <= 200) {
              proximityTag = { label: "Approaching", class: "approaching" };
            }

            return (
              <div key={user.id} className="user-card">
                <div className="user-card-left">
                  <div
                    className="user-badge-initial"
                    style={{ backgroundColor: user.color || "#5EEAD4" }}
                  >
                    {(user.username || "U").charAt(0).toUpperCase()}
                  </div>
                  <div className="user-card-names">
                    <span className="user-card-name">{user.username}</span>
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
            );
          })
        )}
      </div>
    </section>
  );
}
