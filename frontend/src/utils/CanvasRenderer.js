import { createPerformanceMonitor } from "./performanceMonitor";
import { OFFICE_CONFIG } from "./officeLayout";
import { calculateDistance } from "./distance";
import { calculateVolume } from "./audioCalculations";

export class CanvasRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", {
      alpha: false,
    });
    this.width = options.width || (OFFICE_CONFIG ? OFFICE_CONFIG.width : 1200);
    this.height = options.height || (OFFICE_CONFIG ? OFFICE_CONFIG.height : 800);
    this.background = options.background || "#111827";
    this.gridSize = options.gridSize || 40;
    this.layout = options.layout || OFFICE_CONFIG;

    this.avatars = [];
    this.localUser = null;
    this.furniture = [];
    this.audioRadius = options.audioRadius || 100;
    this.speakerMuted = options.speakerMuted || false;

    this.animationId = null;
    this.running = false;
    this.dirty = true;
    this.isMoving = false;
    this.pulseAngle = 0;
    this.lastTime = 0;

    this.monitor = createPerformanceMonitor();
    this.onPerformanceUpdate = null;

    // Offscreen cache for static office elements
    this.staticCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    this.staticCtx = this.staticCanvas ? this.staticCanvas.getContext("2d") : null;

    this.resize();
    this.renderStaticLayer();
  }

  resize() {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (this.staticCanvas && this.staticCtx) {
      this.staticCanvas.width = this.width * dpr;
      this.staticCanvas.height = this.height * dpr;
      this.staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    this.renderStaticLayer();
    this.invalidate();
  }

  setScene({ furniture, background, width, height, layout }) {
    if (furniture) this.furniture = furniture;
    if (background) this.background = background;
    if (width) this.width = width;
    if (height) this.height = height;
    if (layout) this.layout = layout;

    this.resize();
  }

  setAvatars(avatars) {
    this.avatars = Array.isArray(avatars) ? avatars : [];
    this.invalidate();
  }

  setWorldData({ localUser, remoteUsers, audioRadius, speakerMuted }) {
    if (localUser !== undefined) this.localUser = localUser;
    if (audioRadius !== undefined) this.audioRadius = audioRadius;
    if (speakerMuted !== undefined) this.speakerMuted = speakerMuted;
    const combined = [
      ...(localUser ? [{ ...localUser, isLocal: true }] : []),
      ...(remoteUsers || []),
    ];
    this.setAvatars(combined);
  }

  invalidate() {
    this.dirty = true;
    if (!this.running) {
      this.renderFrame();
    }
  }

  renderStaticLayer() {
    if (!this.staticCtx) return;
    const ctx = this.staticCtx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Background
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. High-tech subtle grid pattern
    ctx.strokeStyle = "rgba(55, 65, 81, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= this.width; x += this.gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
    }
    for (let y = 0; y <= this.height; y += this.gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
    }
    ctx.stroke();

    // 3. Office Zones
    if (this.layout && Array.isArray(this.layout.zones)) {
      for (const zone of this.layout.zones) {
        ctx.fillStyle = zone.color || "rgba(31, 41, 55, 0.6)";
        ctx.fillRect(zone.x, zone.y, zone.w, zone.h);

        ctx.strokeStyle = "rgba(55, 65, 81, 0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);

        ctx.fillStyle = "#9CA3AF";
        ctx.font = "600 11px Inter, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(zone.label.toUpperCase(), zone.x + 10, zone.y + 18);
      }
    }

    // 4. Desks
    if (this.layout && Array.isArray(this.layout.desks)) {
      for (const desk of this.layout.desks) {
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
    }

    // 5. Meeting Tables
    if (this.layout && Array.isArray(this.layout.meetingTables)) {
      for (const table of this.layout.meetingTables) {
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
    }

    // 6. Plants
    if (this.layout && Array.isArray(this.layout.plants)) {
      for (const plant of this.layout.plants) {
        ctx.beginPath();
        ctx.arc(plant.x, plant.y, plant.r, 0, Math.PI * 2);
        ctx.fillStyle = "#059669";
        ctx.fill();
        ctx.strokeStyle = "#10B981";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // 7. Outer Walls
    if (this.layout && Array.isArray(this.layout.walls)) {
      ctx.fillStyle = "#0F172A";
      for (const wall of this.layout.walls) {
        ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      }
    }

    // 8. Custom Furniture items
    for (const item of this.furniture) {
      ctx.save();
      const centerX = item.x + item.width / 2;
      const centerY = item.y + item.height / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate(((item.rotation || 0) * Math.PI) / 180);
      ctx.fillStyle = item.color || "#475569";
      ctx.fillRect(
        -item.width / 2,
        -item.height / 2,
        item.width,
        item.height
      );
      ctx.strokeStyle = "#94a3b8";
      ctx.strokeRect(
        -item.width / 2,
        -item.height / 2,
        item.width,
        item.height
      );
      ctx.restore();
    }
  }

  renderAvatars(ctx) {
    this.pulseAngle = (this.pulseAngle + 0.05) % (Math.PI * 2);

    const me = this.localUser || this.avatars.find((a) => a.isLocal);
    const peers = this.avatars.filter((a) => a !== me && !a.isLocal);

    // 1. Local user proximity radii and spatial links
    if (me && Number.isFinite(me.x) && Number.isFinite(me.y)) {
      const radius = me.earshotRadius || this.audioRadius || 100;

      // Approaching Zone boundary (200px dashed ring)
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 6]);
      ctx.arc(me.x, me.y, 200, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(129, 140, 248, 0.25)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();

      // Primary Earshot Radius (100px circle with soft glow)
      ctx.beginPath();
      ctx.arc(me.x, me.y, radius, 0, Math.PI * 2);
      if (this.speakerMuted) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.05)";
        ctx.strokeStyle = "rgba(239, 68, 68, 0.4)";
      } else {
        ctx.fillStyle = "rgba(94, 234, 212, 0.07)";
        ctx.strokeStyle = "rgba(94, 234, 212, 0.45)";
      }
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Proximity audio links to peers in range
      for (const peer of peers) {
        if (!Number.isFinite(peer.x) || !Number.isFinite(peer.y)) continue;
        const d = calculateDistance(me, peer);
        if (d <= radius) {
          const gain = this.speakerMuted || peer.muted ? 0.1 : calculateVolume(d, radius);
          ctx.beginPath();
          ctx.moveTo(me.x, me.y);
          ctx.lineTo(peer.x, peer.y);
          ctx.strokeStyle = `rgba(94, 234, 212, ${(0.3 + gain * 0.7).toFixed(2)})`;
          ctx.lineWidth = 2 + gain * 2;
          ctx.stroke();
        } else if (d <= 200) {
          ctx.save();
          ctx.setLineDash([3, 5]);
          ctx.beginPath();
          ctx.moveTo(me.x, me.y);
          ctx.lineTo(peer.x, peer.y);
          ctx.strokeStyle = "rgba(251, 191, 36, 0.3)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
      }

      // Cursor target indicator if moving
      if (
        me.targetX !== undefined &&
        me.targetY !== undefined &&
        Math.hypot(me.targetX - me.x, me.targetY - me.y) > 8
      ) {
        ctx.beginPath();
        ctx.arc(me.targetX, me.targetY, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#5EEAD4";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(me.targetX, me.targetY, 8 + Math.sin(this.pulseAngle * 2) * 2, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(94, 234, 212, 0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // 2. Render all avatars
    const allAvatars = me ? [me, ...peers] : this.avatars;
    for (const avatar of allAvatars) {
      if (!Number.isFinite(avatar.x) || !Number.isFinite(avatar.y)) continue;
      const isLocal = Boolean(avatar.isLocal || avatar === me);
      const radius = avatar.radius || (this.layout?.avatarRadius || 14);
      const avColor = avatar.color || (isLocal ? "#818CF8" : "#5EEAD4");
      const isSpeaking = !avatar.muted;

      // Speaking ripple wave animation
      if (isSpeaking) {
        const rippleR = radius + 3 + (Math.sin(this.pulseAngle * 3) + 1) * 3;
        ctx.beginPath();
        ctx.arc(avatar.x, avatar.y, rippleR, 0, Math.PI * 2);
        ctx.strokeStyle = avColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Avatar Body Circle
      ctx.beginPath();
      ctx.arc(avatar.x, avatar.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = avColor;
      ctx.fill();
      ctx.strokeStyle = isLocal ? "#F3F4F6" : "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = isLocal ? 2.5 : 2;
      ctx.stroke();

      // Direction pointer
      const dir = avatar.direction || 0;
      const pointerX = avatar.x + Math.cos(dir) * (radius + 4);
      const pointerY = avatar.y + Math.sin(dir) * (radius + 4);
      ctx.beginPath();
      ctx.arc(pointerX, pointerY, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#F3F4F6";
      ctx.fill();

      // Avatar Initial
      const initial = (avatar.username || "U").charAt(0).toUpperCase();
      ctx.fillStyle = "#111827";
      ctx.font = "bold 11px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initial, avatar.x, avatar.y);

      // Name badge label pill
      ctx.textBaseline = "alphabetic";
      const labelText = isLocal
        ? `${avatar.username || "You"} (You)`
        : avatar.username || "Member";

      ctx.font = "600 11px Inter, system-ui, sans-serif";
      const textMetrics = ctx.measureText(labelText);
      const badgeW = textMetrics.width + 14;
      const badgeH = 18;
      const badgeX = avatar.x - badgeW / 2;
      const badgeY = avatar.y - radius - 22;

      ctx.fillStyle = "rgba(17, 24, 39, 0.85)";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
      } else {
        ctx.rect(badgeX, badgeY, badgeW, badgeH);
      }
      ctx.fill();
      ctx.strokeStyle = isLocal ? "#818CF8" : "#374151";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = isLocal ? "#5EEAD4" : "#F3F4F6";
      ctx.textAlign = "center";
      ctx.fillText(labelText, avatar.x, badgeY + 13);
    }
  }

  renderFrame() {
    if (!this.dirty) return;
    const ctx = this.ctx;

    // Restore cached background and furniture.
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.staticCanvas) {
      ctx.drawImage(this.staticCanvas, 0, 0, this.width, this.height);
    }

    // Draw only dynamic elements.
    this.renderAvatars(ctx);

    this.dirty = false;
    return this.monitor.update();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();

    const loop = () => {
      if (!this.running) return;

      if (this.dirty) {
        const stats = this.renderFrame();
        if (stats && this.onPerformanceUpdate) {
          this.onPerformanceUpdate(stats);
        }
      }

      // Keep scheduling frames while the scene is active.
      // An idle scene is not redrawn.
      if (this.isMoving) {
        this.dirty = true;
        this.animationId = requestAnimationFrame(loop);
      } else {
        this.running = false;
        this.animationId = null;
      }
    };

    this.animationId = requestAnimationFrame(loop);
  }

  setMoving(isMoving) {
    this.isMoving = isMoving;
    if (isMoving) {
      this.dirty = true;
      this.start();
    } else {
      this.invalidate();
    }
  }

  stop() {
    this.running = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  destroy() {
    this.stop();
    this.avatars = [];
    this.furniture = [];
  }
}
