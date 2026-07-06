// Ported from the prototype's src/controller.js: a one-axis P / PI controller on
// the vertical error (target bottom row vs. setpoint row) that outputs a signed
// velocity recommendation. Deadband, clamp, and control-sign match the prototype.

import type { ControllerOptions } from "./config"
import type { Detection } from "./detector"

export type Recommendation = {
  mode: "velocity_mm_s"
  velocity_mm_s: number
} | null

export type ControllerState = {
  integralErrorPxS: number
  lastUpdateMs: number | null
}

export type ControllerResult = {
  setpointYPx: number
  errorYPx: number | null
  recommendation: Recommendation
  controllerState?: ControllerState
}

export function computePRecommendation(
  detection: Detection,
  frameHeight: number,
  options: ControllerOptions,
): ControllerResult {
  const setpointYPx = Math.round(frameHeight * options.setpointYNorm)

  if (!detection.tracking) {
    return { setpointYPx, errorYPx: null, recommendation: null }
  }

  const errorYPx = detection.bottomYPx - setpointYPx
  if (Math.abs(errorYPx) <= options.deadbandPx) {
    return { setpointYPx, errorYPx, recommendation: null }
  }

  const velocityMmS = clamp(
    options.controlSign * options.kpMmSPerPx * errorYPx,
    -options.maxVelocityMmS,
    options.maxVelocityMmS,
  )

  return {
    setpointYPx,
    errorYPx,
    recommendation: { mode: "velocity_mm_s", velocity_mm_s: round(velocityMmS, 4) },
  }
}

export function computePIRecommendation(
  detection: Detection,
  frameHeight: number,
  options: ControllerOptions,
  controllerState: ControllerState,
  nowMs: number,
): ControllerResult {
  const setpointYPx = Math.round(frameHeight * options.setpointYNorm)

  if (!detection.tracking) {
    return {
      setpointYPx,
      errorYPx: null,
      recommendation: null,
      controllerState: resetControllerState(),
    }
  }

  const errorYPx = detection.bottomYPx - setpointYPx
  if (Math.abs(errorYPx) <= options.deadbandPx) {
    return {
      setpointYPx,
      errorYPx,
      recommendation: null,
      controllerState: resetControllerState(nowMs),
    }
  }

  const dtS =
    controllerState.lastUpdateMs !== null
      ? clamp((nowMs - controllerState.lastUpdateMs) / 1000, 0, 0.25)
      : 0

  const nextIntegralErrorPxS = clamp(
    controllerState.integralErrorPxS + errorYPx * dtS,
    -options.maxIntegralErrorPxS,
    options.maxIntegralErrorPxS,
  )

  const velocityMmS = clamp(
    options.controlSign *
      (options.kpMmSPerPx * errorYPx +
        options.kiMmSPerPxS * nextIntegralErrorPxS),
    -options.maxVelocityMmS,
    options.maxVelocityMmS,
  )

  return {
    setpointYPx,
    errorYPx,
    recommendation: { mode: "velocity_mm_s", velocity_mm_s: round(velocityMmS, 4) },
    controllerState: {
      integralErrorPxS: nextIntegralErrorPxS,
      lastUpdateMs: nowMs,
    },
  }
}

export function resetControllerState(
  lastUpdateMs: number | null = null,
): ControllerState {
  return { integralErrorPxS: 0, lastUpdateMs }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
