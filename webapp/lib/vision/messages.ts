// Ported from the prototype's src/messages.js: the stable `vision.tracking`
// message. `t_host_ms` is performance.now(), the same clock the device provider
// stamps onto serial samples (perfRecvMs/syncedMs) — so vision, sensors, and
// webcam frames all share one timeline.

import type { Detection } from "./detector"
import type { Recommendation } from "./controller"

export type TrackingMessage = {
  type: "vision.tracking"
  version: 1
  frame_id: number
  t_host_ms: number
  tracking: boolean
  confidence: number
  frame_width_px: number
  frame_height_px: number
  setpoint: { y_px: number; y_norm: number }
  recommendation: Recommendation
  target: {
    bottom_x_px: number
    bottom_y_px: number
    bbox_px: [number, number, number, number]
    area_px: number
  } | null
  error: { y_px: number | null }
}

export function buildTrackingMessage(input: {
  frameId: number
  frameWidth: number
  frameHeight: number
  detection: Detection
  setpointYPx: number
  setpointYNorm: number
  errorYPx: number | null
  recommendation: Recommendation
}): TrackingMessage {
  const {
    frameId,
    frameWidth,
    frameHeight,
    detection,
    setpointYPx,
    setpointYNorm,
    errorYPx,
    recommendation,
  } = input

  const base = {
    type: "vision.tracking" as const,
    version: 1 as const,
    frame_id: frameId,
    t_host_ms: Math.round(performance.now() * 10) / 10,
    frame_width_px: frameWidth,
    frame_height_px: frameHeight,
    setpoint: { y_px: setpointYPx, y_norm: round(setpointYNorm, 4) },
  }

  if (!detection.tracking) {
    return {
      ...base,
      tracking: false,
      confidence: 0,
      target: null,
      error: { y_px: null },
      recommendation: null,
    }
  }

  return {
    ...base,
    tracking: true,
    confidence: round(detection.confidence, 3),
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
    error: { y_px: errorYPx },
    recommendation,
  }
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
