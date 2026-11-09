import React, { useRef, useEffect } from "react";
import { Mic, MicOff, Monitor, Maximize2, Minimize2, Video, VideoOff } from "lucide-react";
import "../styles/VideoGrid.css";

function VideoTile({ stream, username, isLocal = false, isMuted = false, isScreen = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={`video-tile ${isLocal ? "local" : ""} ${isScreen ? "screen" : ""}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal} // Avoid local echo
        className="video-element"
      />
      <div className="video-overlay-bar">
        <span className="video-participant-name">
          {isScreen && <Monitor size={12} className="inline-icon" />}
          {username} {isLocal ? "(You)" : ""} {isScreen ? "(Screen)" : ""}
        </span>
        <span className={`video-mic-badge ${isMuted ? "muted" : "active"}`}>
          {isMuted ? <MicOff size={12} /> : <Mic size={12} />}
        </span>
      </div>
    </div>
  );
}

export default function VideoGrid({
  localStream,
  localVideoTrack,
  localScreenTrack,
  remoteVideoStreams = {}, // Map or Object: peerId -> { stream, username, isMuted, isScreen }
  currentUsername,
  localMuted = false,
  isScreenSharing = false,
  onStopScreenShare,
}) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  // Build local video stream if track exists
  const localMediaStream = React.useMemo(() => {
    if (!localVideoTrack) return null;
    return new MediaStream([localVideoTrack]);
  }, [localVideoTrack]);

  const localScreenStream = React.useMemo(() => {
    if (!localScreenTrack) return null;
    return new MediaStream([localScreenTrack]);
  }, [localScreenTrack]);

  const remoteEntries = Object.entries(remoteVideoStreams);
  const hasAnyVideo = Boolean(localMediaStream || localScreenStream || remoteEntries.length > 0);

  if (!hasAnyVideo) return null;

  return (
    <div className={`video-stage-container ${isExpanded ? "expanded" : ""}`}>
      <div className="video-stage-header">
        <div className="video-stage-title">
          <Video size={15} className="video-title-icon" />
          <span>Live Video & Screen Streams ({1 + remoteEntries.length})</span>
        </div>
        <div className="video-stage-actions">
          {isScreenSharing && (
            <button
              type="button"
              className="stop-share-badge-btn"
              onClick={onStopScreenShare}
              title="Stop sharing your screen"
            >
              Stop Sharing
            </button>
          )}
          <button
            type="button"
            className="video-expand-btn"
            onClick={() => setIsExpanded((v) => !v)}
            title={isExpanded ? "Minimize grid" : "Expand grid"}
          >
            {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      <div className="video-tiles-grid">
        {/* Local Screen Share Tile */}
        {localScreenStream && (
          <VideoTile
            stream={localScreenStream}
            username={currentUsername}
            isLocal={true}
            isScreen={true}
            isMuted={localMuted}
          />
        )}

        {/* Local Camera Tile */}
        {localMediaStream && (
          <VideoTile
            stream={localMediaStream}
            username={currentUsername}
            isLocal={true}
            isMuted={localMuted}
          />
        )}

        {/* Remote Participant Video Tiles */}
        {remoteEntries.map(([peerId, data]) => (
          <VideoTile
            key={peerId}
            stream={data.stream}
            username={data.username || "Colleague"}
            isLocal={false}
            isScreen={Boolean(data.isScreen)}
            isMuted={Boolean(data.isMuted)}
          />
        ))}
      </div>
    </div>
  );
}

