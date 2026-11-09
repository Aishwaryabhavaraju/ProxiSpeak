import React, { useState } from "react";
import {
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  Hand,
  Footprints,
  Calendar,
  Smile,
  MousePointer,
  Navigation,
} from "lucide-react";
import { AVATAR_REACTIONS } from "../utils/emojiData";
import "../styles/Toolbar.css";

export default function Toolbar({
  localAutoWalk,
  onToggleLocalAutoWalk,
  videoEnabled = false,
  onToggleVideo,
  isScreenSharing = false,
  onToggleScreenShare,
  handRaised = false,
  onToggleHandRaise,
  onSendAvatarReaction,
  onOpenScheduler,
}) {
  const [showReactions, setShowReactions] = useState(false);

  return (
    <div className="office-toolbar">
      <div className="office-toolbar-controls">
        {/* Camera Toggle */}
        {onToggleVideo && (
          <button
            type="button"
            className={`toolbar-mode-btn ${videoEnabled ? "active-green" : ""}`}
            onClick={onToggleVideo}
            title={videoEnabled ? "Turn off camera" : "Turn on camera"}
          >
            {videoEnabled ? <Video size={15} /> : <VideoOff size={15} />}
            <span>{videoEnabled ? "Camera: ON" : "Camera: OFF"}</span>
          </button>
        )}

        {/* Screen Share Toggle */}
        {onToggleScreenShare && (
          <button
            type="button"
            className={`toolbar-mode-btn ${isScreenSharing ? "active-blue" : ""}`}
            onClick={onToggleScreenShare}
            title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
          >
            {isScreenSharing ? <MonitorOff size={15} /> : <Monitor size={15} />}
            <span>{isScreenSharing ? "Sharing Screen" : "Share Screen"}</span>
          </button>
        )}

        {/* Hand Raise Toggle */}
        {onToggleHandRaise && (
          <button
            type="button"
            className={`toolbar-mode-btn ${handRaised ? "active-amber" : ""}`}
            onClick={onToggleHandRaise}
            title={handRaised ? "Lower hand" : "Raise hand"}
          >
            <Hand size={15} />
            <span>{handRaised ? "Hand Raised ✋" : "Raise Hand"}</span>
          </button>
        )}

        {/* Avatar Floating Reactions Popup */}
        {onSendAvatarReaction && (
          <div className="toolbar-reaction-anchor">
            <button
              type="button"
              className={`toolbar-mode-btn ${showReactions ? "active" : ""}`}
              onClick={() => setShowReactions((v) => !v)}
              title="React above avatar"
            >
              <Smile size={15} />
              <span>React</span>
            </button>

            {showReactions && (
              <div className="toolbar-reactions-popover">
                {AVATAR_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="toolbar-emoji-btn"
                    onClick={() => {
                      onSendAvatarReaction(emoji);
                      setShowReactions(false);
                    }}
                    title={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Meeting Scheduler Button */}
        {onOpenScheduler && (
          <button
            type="button"
            className="toolbar-mode-btn"
            onClick={onOpenScheduler}
            title="Schedule or view meetings"
          >
            <Calendar size={15} />
            <span>Schedule</span>
          </button>
        )}

        {/* Auto Walk Toggle */}
        <button
          type="button"
          className={`toolbar-mode-btn ${localAutoWalk ? "active" : ""}`}
          onClick={onToggleLocalAutoWalk}
          title="Auto-walk along path"
        >
          <Footprints size={15} />
          <span>{localAutoWalk ? "Auto: ON" : "Auto: OFF"}</span>
        </button>
      </div>

      <div className="office-toolbar-tips">
        <div className="toolbar-tip-item">
          <MousePointer size={14} className="toolbar-tip-icon" />
          <span>Click canvas or use <strong>WASD / Arrow Keys</strong> to move</span>
        </div>
        <div className="toolbar-tip-item">
          <Navigation size={14} className="toolbar-tip-icon teal" />
          <span>Move within <strong>100px</strong> of colleagues for voice earshot</span>
        </div>
      </div>
    </div>
  );
}
