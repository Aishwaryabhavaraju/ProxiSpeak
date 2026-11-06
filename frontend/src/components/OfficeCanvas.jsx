import React, { useEffect, useRef, useState, useCallback } from "react";
import { OFFICE_CONFIG } from "../utils/officeLayout";
import { CanvasRenderer } from "../utils/CanvasRenderer";
import { moveAvatar } from "../utils/movementOptimizer";
import { measureRenderingPerformance } from "../utils/renderPerformanceTest";

/**
 * 60 FPS Virtual Office Canvas with offscreen static caching, dirty checking,
 * delta-time avatar movement, and real-time FPS/frame-time monitoring.
 */
function OfficeCanvas({
  worldRef,
  audioRadius = 100,
  speakerMuted = false,
  onSelectLocalTarget,
  furniture,
}) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const pressedKeysRef = useRef({});
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [performanceStats, setPerformanceStats] = useState({
    fps: 0,
    frameTime: 0,
  });

  // Initialize CanvasRenderer with static background and furniture cache
  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const renderer = new CanvasRenderer(canvasRef.current, {
      width: OFFICE_CONFIG.width,
      height: OFFICE_CONFIG.height,
      background: "#111827",
      gridSize: OFFICE_CONFIG.gridSize,
      layout: OFFICE_CONFIG,
      audioRadius,
      speakerMuted,
    });

    renderer.onPerformanceUpdate = (stats) => {
      setPerformanceStats(stats);
    };

    rendererRef.current = renderer;

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [audioRadius, speakerMuted]);

  // Expose performance benchmark runner for browser console testing
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.runCanvasTest = async (duration = 10000) => {
        console.log(`Starting ${duration / 1000}s Canvas FPS benchmark...`);
        const result = await measureRenderingPerformance(duration);
        console.table(result);
        console.log(
          result.averageFPS >= 55
            ? "Canvas performance: PASS"
            : "Canvas performance: NEEDS OPTIMIZATION"
        );
        return result;
      };
    }
  }, []);

  // Update furniture/scene when layout changes
  useEffect(() => {
    if (rendererRef.current && furniture) {
      rendererRef.current.setScene({ furniture });
    }
  }, [furniture]);

  // Main sync and animation loop driver
  useEffect(() => {
    let animId;
    let prevTime = performance.now();

    function renderLoop() {
      const now = performance.now();
      const dt = (now - prevTime) / 1000;
      prevTime = now;

      const renderer = rendererRef.current;
      if (renderer) {
        const { localUser, remoteUsers = [] } = worldRef?.current || {};

        // Delta-time based avatar movement if keys are pressed
        const keys = pressedKeysRef.current;
        const isKeyPressed = Object.values(keys).some(Boolean);

        if (isKeyPressed && localUser && onSelectLocalTarget) {
          const nextPos = moveAvatar(
            localUser,
            keys,
            dt,
            { width: OFFICE_CONFIG.width, height: OFFICE_CONFIG.height }
          );
          onSelectLocalTarget(nextPos);
        }

        // Determine if scene is dynamic/moving
        const isLocalMoving = Boolean(
          localUser && (
            (localUser.targetX !== undefined && Math.hypot(localUser.targetX - localUser.x, localUser.targetY - localUser.y) > 2) ||
            isKeyPressed ||
            isMouseDown ||
            !localUser.muted
          )
        );
        const isRemoteMoving = remoteUsers.some((u) => u.moving || !u.muted);
        const isSceneActive = isLocalMoving || isRemoteMoving;

        renderer.setWorldData({
          localUser,
          remoteUsers,
          audioRadius,
          speakerMuted,
        });

        renderer.setMoving(isSceneActive);
      }

      animId = requestAnimationFrame(renderLoop);
    }

    animId = requestAnimationFrame(renderLoop);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [worldRef, audioRadius, speakerMuted, isMouseDown, onSelectLocalTarget]);

  // Keyboard handlers for delta-time movement and loop activation
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "W", "A", "S", "D"].includes(
          event.key
        )
      ) {
        if (event.key.startsWith("Arrow")) {
          event.preventDefault();
        }
        pressedKeysRef.current[event.key] = true;
        rendererRef.current?.setMoving(true);
      }
    };

    const handleKeyUp = (event) => {
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "W", "A", "S", "D"].includes(
          event.key
        )
      ) {
        pressedKeysRef.current[event.key] = false;
        const stillMoving = Object.values(pressedKeysRef.current).some(Boolean);
        if (!stillMoving) {
          rendererRef.current?.setMoving(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

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
    rendererRef.current?.setMoving(true);
    const coords = getCanvasCoords(event);
    if (coords && onSelectLocalTarget) {
      onSelectLocalTarget(coords);
    }
  }

  function handleMouseMove(event) {
    const coords = getCanvasCoords(event);
    if (!coords) return;
    if (isMouseDown && onSelectLocalTarget) {
      rendererRef.current?.setMoving(true);
      onSelectLocalTarget(coords);
    }
  }

  function handleMouseUp() {
    setIsMouseDown(false);
  }

  function handleClick(event) {
    const coords = getCanvasCoords(event);
    if (coords && onSelectLocalTarget) {
      rendererRef.current?.setMoving(true);
      onSelectLocalTarget(coords);
    }
  }

  return (
    <div className="canvas-wrapper">
      <div className="performance-monitor" aria-live="polite">
        <span>FPS: {performanceStats.fps || 60}</span>
        <span>Frame: {performanceStats.frameTime || 16.67} ms</span>
      </div>
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
