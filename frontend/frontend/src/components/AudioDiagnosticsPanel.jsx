import React, { useState, useEffect } from "react";
import { webrtcManager } from "../services/webrtc";
import { audioEngine } from "../services/audioEngine";
import {
  Activity,
  Wifi,
  Radio,
  Volume2,
  Cpu,
  ChevronDown,
  ChevronUp,
  X,
  RefreshCw,
  Sliders,
} from "lucide-react";
import "../styles/AudioDiagnosticsPanel.css";

export default function AudioDiagnosticsPanel({ isOpen, onClose }) {
  const [stats, setStats] = useState([]);
  const [contextInfo, setContextInfo] = useState(() =>
    audioEngine.getAudioContextInfo()
  );
  const [expandedPeer, setExpandedPeer] = useState(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    let isMounted = true;

    async function fetchMetrics() {
      try {
        const peerStats = await webrtcManager.getAllPeerStats();
        const ctxInfo = audioEngine.getAudioContextInfo();
        if (isMounted) {
          setStats(peerStats);
          setContextInfo(ctxInfo);
        }
      } catch (err) {
        console.warn("[Diagnostics] Stats fetch failed:", err);
      }
    }

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="diag-panel-backdrop">
      <div className="diag-panel-card" role="dialog" aria-label="Developer Audio Diagnostics">
        {/* Header */}
        <div className="diag-header">
          <div className="diag-title-wrap">
            <Activity className="diag-title-icon" size={18} />
            <h3 className="diag-title">Real-Time Audio & WebRTC Diagnostics</h3>
            <span className="diag-badge-live">LIVE TELEMETRY</span>
          </div>
          <button
            type="button"
            className="diag-close-btn"
            onClick={onClose}
            aria-label="Close Diagnostics"
          >
            <X size={16} />
          </button>
        </div>

        {/* Global Pipeline Health Status */}
        <div className="diag-global-grid">
          <div className="diag-metric-box">
            <div className="diag-box-label">
              <Cpu size={13} />
              <span>AudioContext</span>
            </div>
            <div className="diag-box-value highlight">
              <span
                className={`diag-status-dot ${
                  contextInfo.state === "running" ? "green" : "amber"
                }`}
              />
              <span className="capitalize">{contextInfo.state}</span>
            </div>
            <div className="diag-box-sub">
              {contextInfo.sampleRate ? `${contextInfo.sampleRate} Hz` : "N/A"} • Latency:{" "}
              {contextInfo.baseLatency}ms
            </div>
          </div>

          <div className="diag-metric-box">
            <div className="diag-box-label">
              <Radio size={13} />
              <span>Active Peers</span>
            </div>
            <div className="diag-box-value">{stats.length} Connected</div>
            <div className="diag-box-sub">Full-Mesh Topology</div>
          </div>

          <div className="diag-metric-box">
            <div className="diag-box-label">
              <Sliders size={13} />
              <span>Spatial Audio</span>
            </div>
            <div className="diag-box-value highlight">Web Audio HRTF</div>
            <div className="diag-box-sub">True 3D Binaural Positioning</div>
          </div>
        </div>

        {/* Peer Connection Telemetry Table / Cards */}
        <div className="diag-peers-container">
          <h4 className="diag-section-title">
            <Wifi size={14} />
            <span>Participant WebRTC Audio Streams ({stats.length})</span>
          </h4>

          {stats.length === 0 ? (
            <div className="diag-empty-peers">
              <RefreshCw size={24} className="diag-spin-slow" />
              <p>No remote WebRTC peer connections established yet.</p>
              <span>Join with a second browser tab or invite a colleague to observe real stats.</span>
            </div>
          ) : (
            <div className="diag-peers-list">
              {stats.map((peer) => {
                const isExpanded = expandedPeer === peer.peerId;
                const sp = peer.spatialInfo;

                return (
                  <div key={peer.peerId} className="diag-peer-row">
                    <div
                      className="diag-peer-summary"
                      onClick={() =>
                        setExpandedPeer(isExpanded ? null : peer.peerId)
                      }
                    >
                      <div className="diag-peer-col-main">
                        <span className="diag-peer-name">{peer.peerId}</span>
                        <span
                          className={`diag-peer-state ${
                            peer.connectionState === "connected"
                              ? "connected"
                              : "connecting"
                          }`}
                        >
                          {peer.connectionState}
                        </span>
                        <span className="diag-peer-type">{peer.connectionType}</span>
                      </div>

                      <div className="diag-peer-col-stats">
                        <div className="diag-stat-pill">
                          <span className="lbl">RTT</span>
                          <span className="val">{peer.rtt} ms</span>
                        </div>
                        <div className="diag-stat-pill">
                          <span className="lbl">Jitter</span>
                          <span className="val">{peer.jitter} ms</span>
                        </div>
                        <div className="diag-stat-pill">
                          <span className="lbl">Loss</span>
                          <span className={`val ${peer.packetsLost > 0 ? "warn" : ""}`}>
                            {peer.packetsLost}
                          </span>
                        </div>
                        <div className="diag-stat-pill">
                          <span className="lbl">Bitrate</span>
                          <span className="val">{peer.bitrate} kbps</span>
                        </div>
                      </div>

                      <button type="button" className="diag-expand-icon">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="diag-peer-details">
                        <div className="diag-details-grid">
                          <div className="diag-detail-item">
                            <span className="d-lbl">Negotiated Audio Codec:</span>
                            <span className="d-val">{peer.codec}</span>
                          </div>
                          <div className="diag-detail-item">
                            <span className="d-lbl">ICE State:</span>
                            <span className="d-val">{peer.iceConnectionState}</span>
                          </div>
                          <div className="diag-detail-item">
                            <span className="d-lbl">Jitter Buffer Delay:</span>
                            <span className="d-val">{peer.jitterBufferDelay} ms</span>
                          </div>
                          <div className="diag-detail-item">
                            <span className="d-lbl">Audio Track Status:</span>
                            <span className="d-val">{peer.audioTrackState}</span>
                          </div>

                          {sp && (
                            <>
                              <div className="diag-detail-item">
                                <span className="d-lbl">Avatar Distance:</span>
                                <span className="d-val">{sp.distance} px</span>
                              </div>
                              <div className="diag-detail-item">
                                <span className="d-lbl">Spatial Attenuation Gain:</span>
                                <span className="d-val">{Math.round(sp.currentGain * 100)}%</span>
                              </div>
                              <div className="diag-detail-item">
                                <span className="d-lbl">Panner 3D Coordinates:</span>
                                <span className="d-val">
                                  X: {sp.posX}, Z: {sp.posZ}
                                </span>
                              </div>
                              <div className="diag-detail-item">
                                <span className="d-lbl">Panning & Distance Model:</span>
                                <span className="d-val">
                                  {sp.panningModel} / {sp.distanceModel}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info note */}
        <div className="diag-footer">
          <p>
            Statistics are sourced directly via <code>RTCPeerConnection.getStats()</code> and the Web Audio API audio graph.
          </p>
        </div>
      </div>
    </div>
  );
}

