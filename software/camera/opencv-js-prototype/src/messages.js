// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

export function buildTrackingMessage({
  frameId,
  frameWidth,
  frameHeight,
  detection,
  setpointYPx,
  setpointYNorm,
  errorYPx,
  recommendation,
}) {
  const base = {
    type: "vision.tracking",
    version: 1,
    frame_id: frameId,
    t_host_ms: Math.round(performance.now() * 10) / 10,
    tracking: detection.tracking,
    confidence: round(detection.confidence, 3),
    frame_width_px: frameWidth,
    frame_height_px: frameHeight,
    setpoint: {
      y_px: setpointYPx,
      y_norm: round(setpointYNorm, 4),
    },
    recommendation,
  }

  if (!detection.tracking) {
    return {
      ...base,
      confidence: 0,
      target: null,
      error: {
        y_px: null,
      },
      recommendation: null,
    }
  }

  return {
    ...base,
    target: {
      bottom_x_px: detection.bottomXPx,
      bottom_y_px: detection.bottomYPx,
      bbox_px: [
        detection.bbox.x,
        detection.bbox.y,
        detection.bbox.width,
        detection.bbox.height,
      ],
      area_px: Math.round(detection.areaPx),
    },
    error: {
      y_px: errorYPx,
    },
  }
}

function round(value, digits) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
