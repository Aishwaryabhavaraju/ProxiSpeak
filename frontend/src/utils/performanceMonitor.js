export function createPerformanceMonitor() {
  let frameCount = 0;
  let lastFpsUpdate = performance.now();
  let fps = 0;
  let frameTime = 0;
  let lastFrameTime = performance.now();

  return {
    update() {
      const now = performance.now();
      frameTime = now - lastFrameTime;
      lastFrameTime = now;
      frameCount++;

      if (now - lastFpsUpdate >= 1000) {
        fps = Math.round(
          (frameCount * 1000) / (now - lastFpsUpdate)
        );
        frameCount = 0;
        lastFpsUpdate = now;
      }

      return {
        fps,
        frameTime: Number(frameTime.toFixed(2)),
        targetFrameTime: 16.67,
      };
    },
  };
}

