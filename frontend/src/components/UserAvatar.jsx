import React from "react";

function UserAvatar({ user, metric }) {
  const distanceText = metric ? `${metric.distance} px` : "Local";
  const gainPct = metric ? `${Math.round(metric.gain * 100)}%` : "100%";
  const panLabel =
    metric && metric.inEarshot && metric.distance > 0
      ? metric.pan === 0
        ? "Pan: C"
        : metric.pan > 0
        ? `Pan: R (${Math.round(metric.pan * 100)}%)`
        : `Pan: L (${Math.round(Math.abs(metric.pan) * 100)}%)`
      : null;

  return (
    <div className="user-item">
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: user.color || "#38bdf8",
            display: "inline-block",
          }}
        />
        <span style={{ fontWeight: user.isLocal ? 700 : 500 }}>
          {user.username} {user.isLocal ? "(You)" : ""}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#94a3b8" }}>
        {!user.isLocal && <span>{distanceText}</span>}
        {!user.isLocal && (
          <span style={{ color: metric && metric.inEarshot ? "#38bdf8" : "#94a3b8" }}>
            Vol: {gainPct}
          </span>
        )}
        {!user.isLocal && panLabel && (
          <span style={{ color: "#a855f7", fontSize: "11px" }}>{panLabel}</span>
        )}
        <span style={{ color: user.muted ? "#fca5a5" : "#34d399" }}>
          {user.muted ? "Muted" : "Online"}
        </span>
      </div>
    </div>
  );
}

export default UserAvatar;
