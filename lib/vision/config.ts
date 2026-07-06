// Ported from the IgNYte-FPA OpenCV.js flame-tracking prototype
// (software/camera/opencv-js-prototype/src/config.js). Centralized defaults for
// the camera, HSV detector, and one-axis P/PI controller.

export type HsvColor = { h: number; s: number; v: number }

export type DetectorOptions = {
  /** Lower HSV bound (OpenCV H is 0..180). */
  hsvLow: HsvColor
  /** Upper HSV bound. */
  hsvHigh: HsvColor
  /** Minimum contour area (px²) to count as a target. */
  minAreaPx: number
  /** Morphology open/close kernel size (px). */
  kernelSizePx: number
}

export type ControllerMode = "p" | "pi"

export type ControllerOptions = {
  mode: ControllerMode
  /** Vertical setpoint as a fraction of frame height (0 top .. 1 bottom). */
  setpointYNorm: number
  /** No command while |error| is within this many px. */
  deadbandPx: number
  kpMmSPerPx: number
  kiMmSPerPxS: number
  maxIntegralErrorPxS: number
  /** Velocity clamp (mm/s). */
  maxVelocityMmS: number
  /** +1 or -1 — maps image error sign to motor direction (validate on rig). */
  controlSign: number
  /** Process at most this many frames/s (throttles OpenCV load). */
  processFps: number
  /** Auto-control command send rate (Hz). */
  autoControlHz: number
}

export type VisionConfig = {
  camera: { widthPx: number; heightPx: number; fps: number }
  detector: DetectorOptions
  controller: ControllerOptions
}

export const DEFAULT_VISION_CONFIG: VisionConfig = {
  camera: { widthPx: 1920, heightPx: 1080, fps: 30 },
  detector: {
    hsvLow: { h: 5, s: 80, v: 80 },
    hsvHigh: { h: 45, s: 255, v: 255 },
    minAreaPx: 500,
    kernelSizePx: 5,
  },
  controller: {
    mode: "p",
    setpointYNorm: 0.5,
    deadbandPx: 2,
    kpMmSPerPx: 0.1,
    kiMmSPerPxS: 0.01,
    maxIntegralErrorPxS: 1000,
    maxVelocityMmS: 25.0,
    controlSign: -1,
    processFps: 12,
    autoControlHz: 10,
  },
}

/** Confidence below which auto-control refuses to send a motion command. */
export const MIN_AUTO_CONTROL_CONFIDENCE = 0.5
