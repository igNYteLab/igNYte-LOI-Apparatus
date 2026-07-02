export const DEFAULT_CONFIG = {
  camera: {
    widthPx: 1920,
    heightPx: 1080,
    fps: 30,
  },
  detector: {
    hsvLow: {
      h: 5,
      s: 80,
      v: 80,
    },
    hsvHigh: {
      h: 45,
      s: 255,
      v: 255,
    },
    minAreaPx: 500,
    kernelSizePx: 5,
  },
  controller: {
    setpointYNorm: 0.5,
    deadbandPx: 12,
    kpMmSPerPx: 0.004,
    maxVelocityMmS: 1.0,
    controlSign: 1,
    processFps: 12,
    autoControlHz: 5,
  },
}
