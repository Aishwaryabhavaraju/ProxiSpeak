import React from "react";

function ConnectionStatus({ connectionState, serverUrl, onConnectLive, onUseSimulation }) {
  const badgeColors = {
    connected: { bg: "rgba(16, 185, 129, 0.16)", text: "#34d399", label: "Socket.IO Connected (Live WebRTC)" },
    connecting: { bg: "rgba(245, 158, 11, 0.16)", text: "#fbbf24", label: "Connecting..." },
    simulation: { bg: "rgba(56, 189, 248, 0.16)", text: "#38bdf8", label: "Simulated Multiplayer (Bots)" },
    disconnected: { bg: "rgba(239, 68, 68, 0.16)", text: "#fca5a5", label: "Disconnected" },
  };
  const current = badgeColors[connectionState] || badgeColors.simulation;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
      <span
        style={{
          padding: "5px 10px",
          borderRadius: "999px",
          background: current.bg,
          color: current.text,
          fontSize: "12px",
          fontWeight: 700,
        }}
      >
        ● {current.label}
      </span>
      {connectionState === "simulation" ? (
        <button
          type="button"
          className="toolbar-btn"
          onClick={onConnectLive}
          title={`Connect to live Socket.IO server at ${serverUrl}`}
        >
          Connect Socket.IO ({serverUrl})
        </button>
      ) : (
        <button type="button" className="toolbar-btn" onClick={onUseSimulation}>
          Switch to Mock Mode
        </button>
      )}
    </div>
  );
}

export default ConnectionStatus;
