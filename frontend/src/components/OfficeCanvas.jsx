import React, { useEffect, useRef } from "react";
import { OFFICE_CONFIG } from "../utils/officeLayout";
import { calculateDistance } from "../utils/distance";
import { calculateVolume } from "../utils/audioCalculations";

/**
 * Renders the 2D Virtual Office at 60 FPS directly from `worldRef` without
 * forcing React component re-renders on every animation frame.
 */
function OfficeCanvas({
  worldRef,
  audioRadius = OFFICE_CONFIG.defaultAudioRadius,
  speakerMuted = false,
  onSelectLocalTarget,
}) {
  const canvasRef = useRef(null);
  const propsRef = useRef({ audioRadius, speakerMuted });

  useEffect(() => {
    propsRef.current = { audioRadius, speakerMuted };
  }, [audioRadius, speakerMuted]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let animationId;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = OFFICE_CONFIG.width * dpr;
    canvas.height = OFFICE_CONFIG.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    function drawScene() {
      const { localUser: me, remoteUsers: peers = [] } = worldRef.current || {};
      const { audioRadius: radius, speakerMuted: spkMuted } = propsRef.current;

      // 1. Floor background
      ctx.fillStyle = "#e8eef5";
      ctx.fillRect(0, 0, OFFICE_CONFIG.width, OFFICE_CONFIG.height);

      // 2. Grid lines
      ctx.strokeStyle = "#d5dee8";
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
        ctx.fillStyle = zone.color;
        ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
        ctx.fillStyle = "#475569";
        ctx.font = "bold 11px Inter, Arial, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(zone.label.toUpperCase(), zone.x + 8, zone.y + 16);
      }

      // 4. Desks & Meeting Tables
      for (const desk of OFFICE_CONFIG.desks) {
        ctx.fillStyle = desk.color;
        ctx.fillRect(desk.x, desk.y, desk.w, desk.h);
        ctx.fillStyle = "#f8fafc";
        ctx.font = "11px Inter, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(desk.label, desk.x + desk.w / 2, desk.y + desk.h / 2 + 4);
      }

      for (const table of OFFICE_CONFIG.meetingTables) {
        ctx.fillStyle = table.color;
        ctx.fillRect(table.x, table.y, table.w, table.h);
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "bold 12px Inter, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(table.label, table.x + table.w / 2, table.y + table.h / 2 + 4);
      }

      // 5. Plants
      for (const plant of OFFICE_CONFIG.plants) {
        ctx.beginPath();
        ctx.arc(plant.x, plant.y, plant.r, 0, Math.PI * 2);
        ctx.fillStyle = "#10b981";
        ctx.fill();
      }

      // 6. Outer Walls
      ctx.fillStyle = "#1e293b";
      for (const wall of OFFICE_CONFIG.walls) {
        ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      }

      // 7. Local User Earshot Radius & Proximity Links
      if (me) {
        ctx.beginPath();
        ctx.arc(me.x, me.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = spkMuted
          ? "rgba(239, 68, 68, 0.06)"
          : "rgba(2, 132, 199, 0.10)";
        ctx.fill();
        ctx.strokeStyle = spkMuted
          ? "rgba(239, 68, 68, 0.40)"
          : "rgba(2, 132, 199, 0.45)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        for (const peer of peers) {
          const d = calculateDistance(me, peer);
          if (d < radius) {
            const gain = spkMuted || peer.muted ? 0 : calculateVolume(d, radius);
            ctx.beginPath();
            ctx.moveTo(me.x, me.y);
            ctx.lineTo(peer.x, peer.y);
            ctx.strokeStyle = `rgba(2, 132, 199, ${(0.25 + gain * 0.65).toFixed(2)})`;
            ctx.lineWidth = 1.5 + gain * 2.5;
            ctx.stroke();
          }
        }
      }

      // 8. Draw Remote Avatars & Local Avatar
      const allAvatars = [...peers, ...(me ? [me] : [])];
      for (const av of allAvatars) {
        ctx.beginPath();
        ctx.arc(av.x, av.y, OFFICE_CONFIG.avatarRadius, 0, Math.PI * 2);
        ctx.fillStyle = av.isLocal ? "#0284c7" : av.color || "#0ea5e9";
        ctx.fill();
        ctx.lineWidth = av.isLocal ? 3 : 2;
        ctx.strokeStyle = av.isLocal ? "#0f172a" : "#ffffff";
        ctx.stroke();

        ctx.font = "bold 12px Inter, Arial, sans-serif";
        ctx.textAlign = "center";
        const label = av.isLocal
          ? `${av.username} (You)`
          : `${av.username}${av.muted ? " [Muted]" : ""}`;
        ctx.fillStyle = "#0f172a";
        ctx.fillText(label, av.x, av.y - 22);
      }

      animationId = requestAnimationFrame(drawScene);
    }

    animationId = requestAnimationFrame(drawScene);
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [worldRef]);

  function handleCanvasClick(event) {
    if (!onSelectLocalTarget || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = OFFICE_CONFIG.width / rect.width;
    const scaleY = OFFICE_CONFIG.height / rect.height;
    const clickX = (event.clientX - rect.left) * scaleX;
    const clickY = (event.clientY - rect.top) * scaleY;
    onSelectLocalTarget({ x: clickX, y: clickY });
  }

  return (
    <div className="canvas-wrapper">
      <canvas
        ref={canvasRef}
        className="office-canvas"
        tabIndex={0}
        role="application"
        aria-label="ProxiSpeak 2D Virtual Office Map. Use WASD or Arrow keys to move your avatar."
        onClick={handleCanvasClick}
      />
    </div>
  );
}

export default OfficeCanvas;
