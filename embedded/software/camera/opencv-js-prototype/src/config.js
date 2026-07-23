// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// GitHub: https://github.com/andre-llaneta
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

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
      v: 133,
    },
    brightHsvHigh: {
      h: 13,
      s: 255,
      v: 255,
    },
    coloredHsvLow: {
      h: 0,
      s: 195,
      v: 19,
    },
    coloredHsvHigh: {
      h: 8,
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
