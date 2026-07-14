export const DEFAULT_CONFIG = {
  camera: {
    widthPx: 1920,
    heightPx: 1080,
    fps: 30,
  },
  detector: {
    brightHsvLow: {
      h: 0,
      s: 0,
      v: 170,
    },
    brightHsvHigh: {
      h: 60,
      s: 90,
      v: 255,
    },
    coloredHsvLow: {
      h: 0,
      s: 40,
      v: 80,
    },
    coloredHsvHigh: {
      h: 45,
      s: 255,
      v: 255,
    },
    minAreaPx: 50,
    kernelSizePx: 2,
  },
  controller: {
    mode: "p",
    setpointYNorm: 0.5,
    deadbandPx: 2,
    kpMmSPerPx: 0.1,
    kiMmSPerPxS: 0.01,
    maxIntegralErrorPxS: 1000,
    feedforwardEnabled: false,
    feedforwardGain: 0.5,
    mmPerPx: 0.05,
    imageVelocityAlpha: 0.35,
    // Keep this aligned with firmware Config::kMaxStageAccelMmS2.
    motorAccelerationMmS2: 40.0,
    maxVelocityMmS: 25.0,
    controlSign: -1,
    processFps: 12,
    autoControlHz: 10,
  },
}
