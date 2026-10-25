import React from "react";

function AudioControls({
  micEnabled,
  micMuted,
  speakerMuted,
  micError,
  audioRadius,
  onEnableMic,
  onToggleMicMute,
  onToggleSpeakerMute,
  onChangeRadius,
}) {
  return (
    <section className="sidebar-panel" aria-label="Audio Controls">
      <h3>Audio & Spatial Controls</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {!micEnabled ? (
          <button type="button" className="toolbar-btn active" onClick={onEnableMic}>
            Enable Microphone (WebRTC)
          </button>
        ) : (
          <button
            type="button"
            className={`toolbar-btn ${micMuted ? "danger" : "active"}`}
            onClick={onToggleMicMute}
          >
            {micMuted ? "Unmute Microphone" : "Mute Microphone"}
          </button>
        )}

        <button
          type="button"
          className={`toolbar-btn ${speakerMuted ? "danger" : ""}`}
          onClick={onToggleSpeakerMute}
        >
          {speakerMuted ? "Speaker Output: Muted" : "Speaker Output: On"}
        </button>

        <div style={{ marginTop: "6px" }}>
          <label
            htmlFor="audio-radius-slider"
            style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#cbd5e1", marginBottom: "4px" }}
          >
            <span>Proximity Radius</span>
            <strong>{audioRadius} px</strong>
          </label>
          <input
            id="audio-radius-slider"
            type="range"
            min={60}
            max={220}
            step={10}
            value={audioRadius}
            onChange={(e) => onChangeRadius(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>

        {micError && (
          <div style={{ fontSize: "12px", color: "#fca5a5", marginTop: "4px" }}>
            {micError}
          </div>
        )}
      </div>
    </section>
  );
}

export default AudioControls;
