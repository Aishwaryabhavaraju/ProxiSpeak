import React from "react";
import ConnectionStatus from "./ConnectionStatus";

function OfficeHeader({
  username,
  localId,
  connectionState,
  serverUrl,
  onConnectLive,
  onUseSimulation,
  onLeaveOffice,
}) {
  return (
    <header className="office-header">
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <div style={{ fontWeight: 800, fontSize: "18px", color: "#38bdf8" }}>
          ProxiSpeak
        </div>
        <span style={{ color: "#94a3b8", fontSize: "13px" }}>
          Signed in as <strong style={{ color: "#f8fafc" }}>{username}</strong>{" "}
          <code style={{ fontSize: "11px", color: "#64748b" }}>({localId})</code>
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <ConnectionStatus
          connectionState={connectionState}
          serverUrl={serverUrl}
          onConnectLive={onConnectLive}
          onUseSimulation={onUseSimulation}
        />
        <button type="button" className="toolbar-btn danger" onClick={onLeaveOffice}>
          Leave Office
        </button>
      </div>
    </header>
  );
}

export default OfficeHeader;
