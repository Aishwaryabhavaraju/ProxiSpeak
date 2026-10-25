import React from "react";
import "../styles/Toolbar.css";

function Toolbar({
  localAutoWalk,
  remoteAutoWalk,
  connectionState,
  onToggleLocalAutoWalk,
  onToggleRemoteAutoWalk,
  onAddMockUser,
}) {
  return (
    <div className="toolbar-bar">
      <div className="toolbar-group">
        <button
          type="button"
          className={`toolbar-btn ${localAutoWalk ? "active" : ""}`}
          onClick={onToggleLocalAutoWalk}
        >
          {localAutoWalk ? "Your Avatar: Auto-Walk ON" : "Your Avatar: Manual (WASD / Click)"}
        </button>
        {connectionState === "simulation" && (
          <>
            <button
              type="button"
              className={`toolbar-btn ${remoteAutoWalk ? "active" : ""}`}
              onClick={onToggleRemoteAutoWalk}
            >
              {remoteAutoWalk ? "Bots: Autonomous Walk ON" : "Bots: Paused"}
            </button>
            <button type="button" className="toolbar-btn" onClick={onAddMockUser}>
              + Add Bot Colleague
            </button>
          </>
        )}
      </div>
      <div style={{ fontSize: "12px", color: "#94a3b8" }}>
        Hold WASD / Arrow keys for smooth sliding movement, or click any floor tile.
      </div>
    </div>
  );
}

export default Toolbar;
