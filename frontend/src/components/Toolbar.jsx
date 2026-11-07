import React from "react";
import { Navigation, Footprints, MousePointer } from "lucide-react";
import "../styles/Toolbar.css";

export default function Toolbar({
  localAutoWalk,
  onToggleLocalAutoWalk,
}) {
  return (
    <div className="office-toolbar">
      <div className="office-toolbar-controls">
        <button
          type="button"
          className={`toolbar-mode-btn ${localAutoWalk ? "active" : ""}`}
          onClick={onToggleLocalAutoWalk}
        >
          <Footprints size={15} />
          <span>{localAutoWalk ? "Auto-Walk: ON" : "Auto-Walk: OFF"}</span>
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
