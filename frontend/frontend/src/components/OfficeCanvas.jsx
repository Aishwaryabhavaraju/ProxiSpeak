import React, { useEffect, useRef, useState, useCallback } from "react";
import { OFFICE_CONFIG } from "../utils/officeLayout";
import { calculateDistance } from "../utils/distance";
import { calculateVolume } from "../utils/audioCalculations";

/**
 * 60 FPS Canvas rendering the dark-theme Virtual Office, cursor-following movement,
 * 100px earshot boundary, 200px approaching boundary, and dynamic spatial audio links.
 */
function OfficeCanvas({
  worldRef,
  audioRadius = 100,
  speakerMuted = false,
  onSelectLocalTarget,
}) {
  const canvasRef = useRef(null);
  const propsRef = useRef({ audioRadius, speakerMuted });
  const [isMouseDown, setIsMouseDown] = useState(false);
  const mousePosRef = useRef(null);

  useEffect(() => {
    propsRef.current = { audioRadius, speakerMuted };
  }, [audioRadius, speakerMuted]);

  // Main 60 FPS Canvas Drawing Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let animationId;
    let pulseAngle = 0;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = OFFICE_CONFIG.width * dpr;
    canvas.height = OFFICE_CONFIG.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    function drawScene() {
      pulseAngle = (pulseAngle + 0.05) % (Math.PI * 2);
      const { localUser: me, remoteUsers: peers = [] } = worldRef.current || {};
      const { audioRadius: radius, speakerMuted: spkMuted } = propsRef.current;

      // 1. Floor background: Sophisticated Dark Theme (#111827)
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, OFFICE_CONFIG.width, OFFICE_CONFIG.height);

      // 2. High-tech subtle grid pattern
      ctx.strokeStyle = "rgba(55, 65, 81, 0.4)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= OFFICE_CONFIG.width; x += OFFICE_CONFIG.gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, OFFICE_CONFIG.height);
        ctx.stroke();
      }
      for (let y = 0; y <= OFFICE_CONFIG.height; y += OFFICE_CONFIG.gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(OFFICE_CONFIG.width, y);
        ctx.stroke();
      }

      // 3. Office Zones
      for (const zone of OFFICE_CONFIG.zones) {
        ctx.fillStyle = zone.color || "rgba(31, 41, 55, 0.6)";
        ctx.fillRect(zone.x, zone.y, zone.w, zone.h);

        // Zone border
        ctx.strokeStyle = "rgba(55, 65, 81, 0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);

        // Zone label
        ctx.fillStyle = "#9CA3AF";
        ctx.font = "600 11px Inter, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(zone.label.toUpperCase(), zone.x + 10, zone.y + 18);
      }

      // 4. Desks & Meeting Tables (Dark charcoal #273449 / #1F2937 with clean borders)
      for (const desk of OFFICE_CONFIG.desks) {
        ctx.fillStyle = "#1E293B";
        ctx.fillRect(desk.x, desk.y, desk.w, desk.h);
        ctx.strokeStyle = "#374151";
        ctx.lineWidth = 1;
        ctx.strokeRect(desk.x, desk.y, desk.w, desk.h);

        ctx.fillStyle = "#94A3B8";
        ctx.font = "500 11px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(desk.label, desk.x + desk.w / 2, desk.y + desk.h / 2 + 4);
      }

      for (const table of OFFICE_CONFIG.meetingTables) {
        ctx.fillStyle = "#273449";
        ctx.fillRect(table.x, table.y, table.w, table.h);
        ctx.strokeStyle = "#4B5563";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(table.x, table.y, table.w, table.h);

        ctx.fillStyle = "#E2E8F0";
        ctx.font = "600 12px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(table.label, table.x + table.w / 2, table.y + table.h / 2 + 4);
      }

      // 5. Office Plants
      for (const plant of OFFICE_CONFIG.plants) {
        ctx.beginPath();
        ctx.arc(plant.x, plant.y, plant.r, 0, Math.PI * 2);
        ctx.fillStyle = "#059669";
        ctx.fill();
        ctx.strokeStyle = "#10B981";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 6. Outer Boundary Walls
      ctx.fillStyle = "#0F172A";
      for (const wall of OFFICE_CONFIG.walls) {
        ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      }

      // 7. Local User Proximity Radii & Spatial Links
      if (me) {
        // 7a. Approaching Zone boundary (200px dashed line)
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 6]);
        ctx.arc(me.x, me.y, 200, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(129, 140, 248, 0.25)"; // Indigo accent
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();

        // 7b. Primary Earshot Radius (100px circle with soft glow fill)
        ctx.beginPath();
        ctx.arc(me.x, me.y, radius, 0, Math.PI * 2);

        if (spkMuted) {
          ctx.fillStyle = "rgba(239, 68, 68, 0.05)";
          ctx.strokeStyle = "rgba(239, 68, 68, 0.4)";
        } else {
          // Soft cyan/teal gradient glow for active earshot
          ctx.fillStyle = "rgba(94, 234, 212, 0.07)";
          ctx.strokeStyle = "rgba(94, 234, 212, 0.45)";
        }
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // 7c. Draw audio proximity links to peers in range
        for (const peer of peers) {
          const d = calculateDistance(me, peer);

          if (d <= radius) {
            // In Earshot (< 100px): Strong glowing audio beam
            const gain = spkMuted || peer.muted ? 0.1 : calculateVolume(d, radius);
            ctx.beginPath();
            ctx.moveTo(me.x, me.y);
            ctx.lineTo(peer.x, peer.y);
            ctx.strokeStyle = `rgba(94, 234, 212, ${(0.3 + gain * 0.7).toFixed(2)})`;
            ctx.lineWidth = 2 + gain * 2;
            ctx.stroke();
          } else if (d <= 200) {
            // Approaching zone (101-200px): Subtle dashed guide
            ctx.save();
            ctx.setLineDash([3, 5]);
            ctx.beginPath();
            ctx.moveTo(me.x, me.y);
            ctx.lineTo(peer.x, peer.y);
            ctx.strokeStyle = "rgba(251, 191, 36, 0.3)"; // Amber guide
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // 8. Draw Cursor Target Indicator if moving
      if (me && (Math.hypot(me.targetX - me.x, me.targetY - me.y) > 8)) {
        ctx.beginPath();
        ctx.arc(me.targetX, me.targetY, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#5EEAD4";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(me.targetX, me.targetY, 8 + Math.sin(pulseAngle * 2) * 2, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(94, 234, 212, 0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 9. Draw Remote and Local Avatars
      const allAvatars = [...peers, ...(me ? [me] : [])];
      for (const av of allAvatars) {
        const isLocal = Boolean(av.isLocal);
        const avColor = av.color || (isLocal ? "#818CF8" : "#5EEAD4");
        const isSpeaking = !av.muted;

        // Speaking ripple wave animation
        if (isSpeaking) {
          const rippleR = OFFICE_CONFIG.avatarRadius + 3 + (Math.sin(pulseAngle * 3) + 1) * 3;
          ctx.beginPath();
          ctx.arc(av.x, av.y, rippleR, 0, Math.PI * 2);
          ctx.strokeStyle = avColor;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Avatar Body Circle
        ctx.beginPath();
        ctx.arc(av.x, av.y, OFFICE_CONFIG.avatarRadius, 0, Math.PI * 2);
        ctx.fillStyle = avColor;
        ctx.fill();
        ctx.lineWidth = isLocal ? 2.5 : 2;
        ctx.strokeStyle = isLocal ? "#F3F4F6" : "rgba(255, 255, 255, 0.7)";
        ctx.stroke();

        // Direction Pointer
        const dir = av.direction || 0;
        const pointerX = av.x + Math.cos(dir) * (OFFICE_CONFIG.avatarRadius + 4);
        const pointerY = av.y + Math.sin(dir) * (OFFICE_CONFIG.avatarRadius + 4);
        ctx.beginPath();
        ctx.arc(pointerX, pointerY, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#F3F4F6";
        ctx.fill();

        // Avatar Initial
        const initial = (av.username || "U").charAt(0).toUpperCase();
        ctx.fillStyle = "#111827";
        ctx.font = "bold 11px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(initial, av.x, av.y);

        // Name Badge Label
        ctx.textBaseline = "alphabetic";
        const labelText = isLocal
          ? `${av.username || "You"} (You)`
          : av.username || "Member";

        ctx.font = "600 11px Inter, system-ui, sans-serif";
        const textMetrics = ctx.measureText(labelText);
        const badgeW = textMetrics.width + 14;
        const badgeH = 18;
        const badgeX = av.x - badgeW / 2;
        const badgeY = av.y - OFFICE_CONFIG.avatarRadius - 22;

        // Label pill background
        ctx.fillStyle = "rgba(17, 24, 39, 0.85)";
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
        ctx.fill();
        ctx.strokeStyle = isLocal ? "#818CF8" : "#374151";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label text
        ctx.fillStyle = isLocal ? "#5EEAD4" : "#F3F4F6";
        ctx.textAlign = "center";
        ctx.fillText(labelText, av.x, badgeY + 13);
      }

      animationId = requestAnimationFrame(drawScene);
    }

    animationId = requestAnimationFrame(drawScene);
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [worldRef]);

  // Coordinate mapper from event to canvas dimensions
  const getCanvasCoords = useCallback((event) => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = OFFICE_CONFIG.width / rect.width;
    const scaleY = OFFICE_CONFIG.height / rect.height;
    return {
      x: Math.round((event.clientX - rect.left) * scaleX),
      y: Math.round((event.clientY - rect.top) * scaleY),
    };
  }, []);

  function handleMouseDown(event) {
    setIsMouseDown(true);
    const coords = getCanvasCoords(event);
    if (coords && onSelectLocalTarget) {
      onSelectLocalTarget(coords);
    }
  }

  function handleMouseMove(event) {
    const coords = getCanvasCoords(event);
    if (!coords) return;
    mousePosRef.current = coords;

    // Follow cursor when mouse is pressed or dragged
    if (isMouseDown && onSelectLocalTarget) {
      onSelectLocalTarget(coords);
    }
  }

  function handleMouseUp() {
    setIsMouseDown(false);
  }

  function handleClick(event) {
    const coords = getCanvasCoords(event);
    if (coords && onSelectLocalTarget) {
      onSelectLocalTarget(coords);
    }
  }

  return (
    <div className="canvas-wrapper">
      <canvas
        ref={canvasRef}
        className="office-canvas"
        tabIndex={0}
        role="application"
        aria-label="ProxiSpeak 2D Virtual Office Canvas. Click anywhere to move or use Arrow/WASD keys."
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    </div>
  );
}

export default OfficeCanvas;
