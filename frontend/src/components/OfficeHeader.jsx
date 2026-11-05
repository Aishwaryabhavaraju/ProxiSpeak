import React, { useState } from "react";
import {
  Copy,
  Check,
  Users,
  Radio,
  DoorOpen,
  LogOut,
  Wifi,
  WifiOff,
  AlertTriangle,
} from "lucide-react";
import "../styles/OfficeHeader.css";

export default function OfficeHeader({
  username,
  roomName,
  roomId,
  connectionState,
  memberCount = 1,
  nearbyCount = 0,
  onExitOffice,
  onLogout,
}) {
  const [copied, setCopied] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  async function handleCopy() {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  const isConnected = connectionState === "connected";
  const isConnecting = connectionState === "connecting";

  return (
    <>
      <header className="v-office-header">
        {/* Left Section: Brand & Workspace Info */}
        <div className="v-header-left">
          <div className="v-header-brand">
            <div className="v-brand-icon">
              <Radio size={18} className="v-brand-radio" />
            </div>
            <div className="v-brand-titles">
              <span className="v-brand-title">ProxiSpeak</span>
              <span className="v-brand-room-label">
                {roomName || "Main Office"}
              </span>
            </div>
          </div>

          {/* Room ID with Copy Button */}
          {roomId && (
            <div className="v-room-code-pill" onClick={handleCopy} title="Click to copy room code">
              <span className="v-room-code-tag">CODE:</span>
              <code className="v-room-code-text">{roomId}</code>
              <button type="button" className="v-room-copy-icon">
                {copied ? <Check size={13} className="v-copied-icon" /> : <Copy size={13} />}
              </button>
              {copied && <span className="v-copy-tooltip">Copied!</span>}
            </div>
          )}
        </div>

        {/* Center Section: Live Metrics */}
        <div className="v-header-center">
          {/* Nearby Users Counter (Earshot < 100px) */}
          <div className={`v-metric-pill nearby ${nearbyCount > 0 ? "active" : ""}`}>
            <span className="v-pulse-dot" />
            <span className="v-metric-label">Nearby in Earshot:</span>
            <span className="v-metric-value">{nearbyCount}</span>
          </div>

          {/* Total Room Members */}
          <div className="v-metric-pill total">
            <Users size={14} className="v-metric-icon" />
            <span className="v-metric-label">Total in Room:</span>
            <span className="v-metric-value">{memberCount}</span>
          </div>

          {/* Connection Status Indicator */}
          <div className={`v-status-pill ${connectionState}`}>
            {isConnected ? (
              <>
                <span className="v-status-dot online" />
                <span>Live Connected</span>
              </>
            ) : isConnecting ? (
              <>
                <span className="v-status-dot connecting" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <span className="v-status-dot offline" />
                <span>Local Simulation</span>
              </>
            )}
          </div>
        </div>

        {/* Right Section: User Profile & Actions */}
        <div className="v-header-right">
          <div className="v-user-tag">
            <span className="v-user-tag-text">@{username}</span>
          </div>

          {/* Exit Office Button */}
          <button
            type="button"
            className="v-header-btn v-btn-exit"
            onClick={() => setShowExitConfirm(true)}
            title="Leave workspace back to dashboard"
          >
            <DoorOpen size={16} />
            <span>Exit Office</span>
          </button>

          {/* Logout Button */}
          <button
            type="button"
            className="v-header-btn v-btn-logout"
            onClick={() => setShowLogoutConfirm(true)}
            title="Sign out of account"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Confirmation Modal: Exit Office */}
      {showExitConfirm && (
        <div className="v-modal-overlay">
          <div className="v-modal-card" role="dialog" aria-modal="true">
            <div className="v-modal-icon-wrap">
              <DoorOpen size={28} className="v-modal-icon" />
            </div>
            <h3 className="v-modal-title">Exit Workspace?</h3>
            <p className="v-modal-desc">
              You will leave <strong>{roomName || roomId}</strong> and disconnect your spatial audio session. You can return anytime from your dashboard.
            </p>
            <div className="v-modal-actions">
              <button
                type="button"
                className="v-modal-btn cancel"
                onClick={() => setShowExitConfirm(false)}
              >
                Stay in Office
              </button>
              <button
                type="button"
                className="v-modal-btn confirm"
                onClick={() => {
                  setShowExitConfirm(false);
                  onExitOffice();
                }}
              >
                Exit to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Logout */}
      {showLogoutConfirm && (
        <div className="v-modal-overlay">
          <div className="v-modal-card" role="dialog" aria-modal="true">
            <div className="v-modal-icon-wrap danger">
              <AlertTriangle size={28} className="v-modal-icon danger" />
            </div>
            <h3 className="v-modal-title">Sign Out of ProxiSpeak?</h3>
            <p className="v-modal-desc">
              This will clear your local workstation session and return you to the login screen.
            </p>
            <div className="v-modal-actions">
              <button
                type="button"
                className="v-modal-btn cancel"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="v-modal-btn danger-confirm"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onLogout();
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
