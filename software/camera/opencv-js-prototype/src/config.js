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
