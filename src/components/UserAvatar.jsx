import React from "react";

function UserAvatar({ user, metric }) {
  const distanceText = metric ? `${metric.distance} px` : "Local";
  const gainPct = metric ? `${Math.round(metric.gain * 100)}%` : "100%";

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
        {!user.isLocal && <span>Vol: {gainPct}</span>}
        <span style={{ color: user.muted ? "#fca5a5" : "#34d399" }}>
          {user.muted ? "Muted" : "Online"}
        </span>
      </div>
    </div>
  );
}

export default UserAvatar;
