export function measureRenderingPerformance(durationMs = 10000) {
  return new Promise((resolve) => {
    let frameCount = 0;
    let droppedFrames = 0;
    let totalFrameTime = 0;
    let previousTime = null;

    const startTime = performance.now();

    function measureFrame(currentTime) {
      if (previousTime !== null) {
        const frameTime = currentTime - previousTime;

        totalFrameTime += frameTime;
        frameCount++;

        if (frameTime > 20) {
          droppedFrames++;
        }
      }

      previousTime = currentTime;

      if (currentTime - startTime < durationMs) {
        requestAnimationFrame(measureFrame);
      } else {
        const elapsed = currentTime - startTime;
        const averageFrameTime =
          frameCount > 0 ? totalFrameTime / frameCount : 0;

        resolve({
          durationMs: Math.round(elapsed),
          frames: frameCount,
          averageFPS: Number(
            ((frameCount * 1000) / elapsed).toFixed(2)
          ),
          averageFrameTimeMs: Number(
            averageFrameTime.toFixed(2)
          ),
          droppedFrames,
          targetFPS: 60,
          targetFrameTimeMs: 16.67,
        });
      }
    }

    requestAnimationFrame(measureFrame);
  });
}

