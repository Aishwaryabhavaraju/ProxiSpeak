import assert from "node:assert/strict";
import test from "node:test";
import { createPerformanceMonitor } from "./performanceMonitor.js";
import { moveAvatar } from "./movementOptimizer.js";

test("Day 26: Performance Monitor - Frame Time & Target Frame Budget", () => {
  const monitor = createPerformanceMonitor();
  const initial = monitor.update();

  assert.equal(typeof initial.fps, "number");
  assert.equal(typeof initial.frameTime, "number");
  assert.equal(initial.targetFrameTime, 16.67);

  // Simulate multiple frame ticks
  for (let i = 0; i < 60; i++) {
    const stats = monitor.update();
    assert.equal(stats.targetFrameTime, 16.67);
  }
});

test("Day 26: Movement Optimizer - Cardinal and Diagonal Normalization", () => {
  const bounds = { width: 1200, height: 800 };
  const origin = { x: 500, y: 500 };
  const dt = 0.016; // 16ms delta time (1 frame at 60fps)

  // 1. Move Right via ArrowRight
  const rightPos = moveAvatar(origin, { ArrowRight: true }, dt, bounds);
  assert.ok(rightPos.x > origin.x);
  assert.equal(rightPos.y, origin.y);

  // 2. Move Left via 'a' or 'A'
  const leftPos = moveAvatar(origin, { a: true }, dt, bounds);
  assert.ok(leftPos.x < origin.x);
  assert.equal(leftPos.y, origin.y);

  // 3. Move Up via 'w'
  const upPos = moveAvatar(origin, { w: true }, dt, bounds);
  assert.equal(upPos.x, origin.x);
  assert.ok(upPos.y < origin.y);

  // 4. Move Down via ArrowDown
  const downPos = moveAvatar(origin, { ArrowDown: true }, dt, bounds);
  assert.equal(downPos.x, origin.x);
  assert.ok(downPos.y > origin.y);

  // 5. Diagonal movement normalization: dx and dy should each be (distance / sqrt(2))
  const diagPos = moveAvatar(origin, { ArrowRight: true, ArrowDown: true }, dt, bounds);
  const diagDx = diagPos.x - origin.x;
  const diagDy = diagPos.y - origin.y;
  const straightDx = rightPos.x - origin.x;

  // Normalized diagonal speed: straight distance should approximately equal straightDx
  const diagDistance = Math.hypot(diagDx, diagDy);
  assert.ok(Math.abs(diagDistance - straightDx) < 0.001);

  // 6. Boundary clamping
  const edgePos = { x: 10, y: 10 };
  const clampedPos = moveAvatar(edgePos, { ArrowLeft: true, ArrowUp: true }, dt, bounds);
  assert.equal(clampedPos.x, 12);
  assert.equal(clampedPos.y, 12);

  const maxEdgePos = { x: 1195, y: 795 };
  const clampedMaxPos = moveAvatar(maxEdgePos, { ArrowRight: true, ArrowDown: true }, dt, bounds);
  assert.equal(clampedMaxPos.x, 1200 - 12);
  assert.equal(clampedMaxPos.y, 800 - 12);
});

test("Day 26: Movement Optimizer - Delta Time Scaling", () => {
  const bounds = { width: 1200, height: 800 };
  const origin = { x: 300, y: 300 };

  const smallStep = moveAvatar(origin, { d: true }, 0.016, bounds); // ~16ms
  const largeStep = moveAvatar(origin, { d: true }, 0.032, bounds); // ~32ms

  const smallDistance = smallStep.x - origin.x;
  const largeDistance = largeStep.x - origin.x;

  // 32ms movement should be twice the distance of 16ms movement
  assert.ok(Math.abs(largeDistance - 2 * smallDistance) < 0.01);
});

