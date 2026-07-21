// Ported from the IgNYte-FPA OpenCV.js flame-tracking prototype
// (software/camera/opencv-js-prototype/src/config.js). Centralized defaults for
// the camera, HSV detector, and one-axis P/PI controller.

export type HsvColor = { h: number; s: number; v: number }

export type DetectorOptions = {
  /** Lower HSV bound for bright low-saturation flame regions (OpenCV H is 0..180). */
  brightHsvLow: HsvColor
  /** Upper HSV bound for bright low-saturation flame regions. */
  brightHsvHigh: HsvColor
  /** Lower HSV bound for saturated orange/yellow flame regions. */
  coloredHsvLow: HsvColor
  /** Upper HSV bound for saturated orange/yellow flame regions. */
  coloredHsvHigh: HsvColor
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
  feedforwardEnabled: boolean
  feedforwardGain: number
  /** Camera scale calibration for feedforward. */
  mmPerPx: number
  /** 0..1 smoothing factor for measured target image velocity. */
  imageVelocityAlpha: number
  /** Estimated stage acceleration limit used by the feedforward motor model. */
  motorAccelerationMmS2: number
  /** Velocity clamp (mm/s). */
  maxVelocityMmS: number
  /** +1 or -1 — maps image error sign to motor direction (validate on rig). */
  controlSign: number
  /** Process at most this many frames/s (throttles OpenCV load). */
  processFps: number
  /** Auto-control command send rate (Hz). */
  autoControlHz: number
}

export type CameraOptions = {
  widthPx: number
  heightPx: number
  fps: number
  /** Frame size sent to OpenCV. Lower than camera capture size for speed. */
  analysisWidthPx: number
  analysisHeightPx: number
}

export type VisionConfig = {
  camera: CameraOptions
  detector: DetectorOptions
  controller: ControllerOptions
}

type LegacyDetectorOptions = Partial<DetectorOptions> & {
  hsvLow?: HsvColor
  hsvHigh?: HsvColor
}

const DEFAULT_DETECTOR_OPTIONS: DetectorOptions = {
  brightHsvLow: { h: 0, s: 0, v: 133 },
  brightHsvHigh: { h: 13, s: 255, v: 255 },
  coloredHsvLow: { h: 0, s: 196, v: 19 },
  coloredHsvHigh: { h: 8, s: 255, v: 255 },
  minAreaPx: 50,
  kernelSizePx: 2,
}

export const DEFAULT_VISION_CONFIG: VisionConfig = {
  // Kept modest: OpenCV runs in a worker, but smaller frames still reduce
  // detection latency and leave more CPU headroom for the dashboard.
  camera: {
    widthPx: 640,
    heightPx: 480,
    fps: 30,
    analysisWidthPx: 320,
    analysisHeightPx: 240,
  },
  detector: DEFAULT_DETECTOR_OPTIONS,
  controller: {
    mode: "pi",
    setpointYNorm: 0.5,
    deadbandPx: 2,
    kpMmSPerPx: 0.1,
    kiMmSPerPxS: 0.01,
    maxIntegralErrorPxS: 1000,
    feedforwardEnabled: true,
    feedforwardGain: 0.5,
    mmPerPx: 0.05,
    imageVelocityAlpha: 0.35,
    motorAccelerationMmS2: 40.0,
    maxVelocityMmS: 25.0,
    controlSign: -1,
    processFps: 12,
    autoControlHz: 10,
  },
}

export function normalizeDetectorOptions(
  detector: LegacyDetectorOptions,
): DetectorOptions {
  return {
    brightHsvLow:
      detector.brightHsvLow ??
      detector.hsvLow ??
      DEFAULT_DETECTOR_OPTIONS.brightHsvLow,
    brightHsvHigh:
      detector.brightHsvHigh ??
      detector.hsvHigh ??
      DEFAULT_DETECTOR_OPTIONS.brightHsvHigh,
    coloredHsvLow:
      detector.coloredHsvLow ??
      detector.hsvLow ??
      DEFAULT_DETECTOR_OPTIONS.coloredHsvLow,
    coloredHsvHigh:
      detector.coloredHsvHigh ??
      detector.hsvHigh ??
      DEFAULT_DETECTOR_OPTIONS.coloredHsvHigh,
    minAreaPx: detector.minAreaPx ?? DEFAULT_DETECTOR_OPTIONS.minAreaPx,
    kernelSizePx: detector.kernelSizePx ?? DEFAULT_DETECTOR_OPTIONS.kernelSizePx,
  }
}

export function normalizeVisionConfig(config: Partial<VisionConfig>): VisionConfig {
  return {
    camera: {
      ...DEFAULT_VISION_CONFIG.camera,
      ...config.camera,
    },
    detector: normalizeDetectorOptions(config.detector ?? {}),
    controller: {
      ...DEFAULT_VISION_CONFIG.controller,
      ...config.controller,
    },
  }
}

/** Confidence below which auto-control refuses to send a motion command. */
export const MIN_AUTO_CONTROL_CONFIDENCE = 0.5
