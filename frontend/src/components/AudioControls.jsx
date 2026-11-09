import React from "react";
import { Mic, MicOff, Volume2, VolumeX, Sliders, Radio, KeyRound } from "lucide-react";
import "../styles/AudioControls.css";

export default function AudioControls({
  micEnabled,
  micMuted,
  speakerMuted,
  micError,
  audioRadius = 100,
  masterVolume = 100,
  isPushToTalk = false,
  onEnableMic,
  onToggleMicMute,
  onToggleSpeakerMute,
  onChangeRadius,
  onChangeMasterVolume,
  onTogglePushToTalk,
  onPttMouseDown,
  onPttMouseUp,
}) {
  return (
    <section className="audio-panel" aria-label="Audio Controls">
      <div className="audio-panel-header">
        <div className="audio-panel-title-wrap">
          <Radio size={16} className="audio-panel-icon" />
          <h3 className="audio-panel-title">Audio & Spatial</h3>
        </div>
        <span className="audio-status-tag">Web Audio API</span>
      </div>

      <div className="audio-panel-body">
        {/* Mic Control Button */}
        {!micEnabled ? (
          <button
            type="button"
            className="audio-btn audio-btn-enable"
            onClick={onEnableMic}
          >
            <Mic size={16} />
            <span>Enable Microphone</span>
          </button>
        ) : isPushToTalk ? (
          /* Push-to-Talk Hold-to-Speak button */
          <button
            type="button"
            className={`audio-btn ${micMuted ? "audio-btn-ptt-idle" : "audio-btn-ptt-active"}`}
            onMouseDown={onPttMouseDown}
            onMouseUp={onPttMouseUp}
            onTouchStart={onPttMouseDown}
            onTouchEnd={onPttMouseUp}
          >
            {micMuted ? <MicOff size={16} /> : <Mic size={16} />}
            <span>{micMuted ? "Hold Space / Click to Talk" : "Transmitting Audio..."}</span>
          </button>
        ) : (
          <button
            type="button"
            className={`audio-btn ${micMuted ? "audio-btn-muted" : "audio-btn-active"}`}
            onClick={onToggleMicMute}
          >
            {micMuted ? <MicOff size={16} /> : <Mic size={16} />}
            <span>{micMuted ? "Unmute Microphone" : "Mute Microphone"}</span>
          </button>
        )}

        {/* Speaker Output Control Button */}
        <button
          type="button"
          className={`audio-btn ${speakerMuted ? "audio-btn-deafened" : "audio-btn-speaker"}`}
          onClick={onToggleSpeakerMute}
        >
          {speakerMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          <span>{speakerMuted ? "Deafened (Muted Output)" : "Output: Active"}</span>
        </button>

        {/* Push to talk mode toggle */}
        <div className="audio-ptt-row">
          <button
            type="button"
            className={`audio-ptt-toggle-btn ${isPushToTalk ? "active" : ""}`}
            onClick={onTogglePushToTalk}
          >
            <KeyRound size={13} />
            <span>Push-to-Talk: {isPushToTalk ? "ON (Spacebar)" : "OFF"}</span>
          </button>
        </div>

        {/* Master Output Volume Slider */}
        <div className="audio-slider-wrap">
          <div className="audio-slider-labels">
            <span className="audio-slider-title">
              <Volume2 size={13} />
              <span>Master Output Volume</span>
            </span>
            <span className="audio-radius-badge">{masterVolume}%</span>
          </div>
          <input
            id="master-volume-slider"
            type="range"
            min={0}
            max={100}
            step={5}
            value={masterVolume}
            onChange={(e) => onChangeMasterVolume?.(Number(e.target.value))}
            className="audio-range-input"
          />
        </div>

        {/* Spatial Radius Slider */}
        <div className="audio-slider-wrap">
          <div className="audio-slider-labels">
            <span className="audio-slider-title">
              <Sliders size={13} />
              <span>Earshot Radius</span>
            </span>
            <span className="audio-radius-badge">{audioRadius} px</span>
          </div>
          <input
            id="audio-radius-slider"
            type="range"
            min={60}
            max={200}
            step={10}
            value={audioRadius}
            onChange={(e) => onChangeRadius(Number(e.target.value))}
            className="audio-range-input"
          />
          <div className="audio-slider-sub">
            <span>Conversational: 100px</span>
            <span>Max: 200px</span>
          </div>
        </div>

        {/* Error notification if microphone access blocked */}
        {micError && (
          <div className="audio-error-banner" role="alert">
            <span>{micError}</span>
          </div>
        )}
      </div>
    </section>
  );
}
