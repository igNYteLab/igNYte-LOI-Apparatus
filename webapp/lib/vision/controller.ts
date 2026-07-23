// Ported from the prototype's src/controller.js: a one-axis P / PI controller on
// the vertical error (target bottom row vs. setpoint row) that outputs a signed
// velocity recommendation. Optional feedforward estimates flame motion from
// image velocity and compensates for camera motion caused by the stage.

import type { ControllerOptions } from "./config"
import type { Detection } from "./detector"

export type VelocityRecommendation = {
  mode: "velocity_mm_s"
  velocity_mm_s: number
  feedback_velocity_mm_s?: number
  feedforward_velocity_mm_s?: number
  estimated_applied_motor_mm_s?: number
  image_velocity_px_s?: number
  camera_velocity_px_s?: number
  estimated_flame_velocity_px_s?: number
}

export type Recommendation = VelocityRecommendation | null

export type ControllerState = {
  integralErrorPxS: number
  lastUpdateMs: number | null
  lastBottomYPx: number | null
  imageVelocityPxS: number
  lastCommandedMmS: number
  estimatedAppliedMmS: number
}

export type ControllerResult = {
  setpointYPx: number
  errorYPx: number | null
  recommendation: Recommendation
  controllerState: ControllerState
}

export function computePRecommendation(
  detection: Detection,
  frameHeight: number,
  options: ControllerOptions,
  controllerState: ControllerState,
  nowMs: number,
): ControllerResult {
  return computeRecommendation(detection, frameHeight, options, controllerState, nowMs, {
    useIntegral: false,
  })
}

export function computePIRecommendation(
  detection: Detection,
  frameHeight: number,
  options: ControllerOptions,
  controllerState: ControllerState,
  nowMs: number,
): ControllerResult {
  return computeRecommendation(detection, frameHeight, options, controllerState, nowMs, {
    useIntegral: true,
  })
}

export function resetControllerState(
  lastUpdateMs: number | null = null,
  lastCommandedMmS = 0,
  estimatedAppliedMmS = 0,
): ControllerState {
  return {
    integralErrorPxS: 0,
    lastUpdateMs,
    lastBottomYPx: null,
    imageVelocityPxS: 0,
    lastCommandedMmS,
    estimatedAppliedMmS,
  }
}

export function noteCommandedVelocity(
  controllerState: ControllerState,
  velocityMmS: number,
): ControllerState {
  return { ...controllerState, lastCommandedMmS: velocityMmS }
}

function computeRecommendation(
  detection: Detection,
  frameHeight: number,
  options: ControllerOptions,
  controllerState: ControllerState,
  nowMs: number,
  { useIntegral }: { useIntegral: boolean },
): ControllerResult {
  const setpointYPx = Math.round(frameHeight * options.setpointYNorm)
  const elapsedS =
    controllerState.lastUpdateMs !== null
      ? Math.max(0, (nowMs - controllerState.lastUpdateMs) / 1000)
      : 0
  const dtS = clamp(elapsedS, 0, 0.25)
  const nextEstimatedAppliedMmS = moveToward(
    controllerState.estimatedAppliedMmS,
    controllerState.lastCommandedMmS,
    Math.max(0, options.motorAccelerationMmS2) * elapsedS,
  )

  if (!detection.tracking) {
    return {
      setpointYPx,
      errorYPx: null,
      recommendation: null,
      controllerState: resetControllerState(
        nowMs,
        controllerState.lastCommandedMmS,
        nextEstimatedAppliedMmS,
      ),
    }
  }

  const errorYPx = detection.bottomYPx - setpointYPx
  const nextImageVelocityPxS = computeSmoothedImageVelocity(
    detection.bottomYPx,
    controllerState,
    dtS,
    options.imageVelocityAlpha,
  )

  const insideDeadband = Math.abs(errorYPx) <= options.deadbandPx
  const nextIntegralErrorPxS =
    useIntegral && !insideDeadband
      ? clamp(
          controllerState.integralErrorPxS + errorYPx * dtS,
          -options.maxIntegralErrorPxS,
          options.maxIntegralErrorPxS,
        )
      : 0

  const feedbackVelocityMmS = insideDeadband
    ? 0
    : options.controlSign *
      (options.kpMmSPerPx * errorYPx +
        (useIntegral ? options.kiMmSPerPxS * nextIntegralErrorPxS : 0))

  const feedforward = computeFeedforward(
    nextImageVelocityPxS,
    nextEstimatedAppliedMmS,
    options,
  )
  const feedforwardVelocityMmS = options.feedforwardEnabled
    ? feedforward.velocityMmS
    : 0

  const velocityMmS = clamp(
    feedbackVelocityMmS + feedforwardVelocityMmS,
    -options.maxVelocityMmS,
    options.maxVelocityMmS,
  )
  const nextControllerState: ControllerState = {
    integralErrorPxS: nextIntegralErrorPxS,
    lastUpdateMs: nowMs,
    lastBottomYPx: detection.bottomYPx,
    imageVelocityPxS: nextImageVelocityPxS,
    lastCommandedMmS: controllerState.lastCommandedMmS,
    estimatedAppliedMmS: nextEstimatedAppliedMmS,
  }

  if (Math.abs(velocityMmS) < 0.0001) {
    return {
      setpointYPx,
      errorYPx,
      recommendation: null,
      controllerState: nextControllerState,
    }
  }

  return {
    setpointYPx,
    errorYPx,
    recommendation: {
      mode: "velocity_mm_s",
      velocity_mm_s: round(velocityMmS, 4),
      feedback_velocity_mm_s: round(feedbackVelocityMmS, 4),
      feedforward_velocity_mm_s: round(feedforwardVelocityMmS, 4),
      estimated_applied_motor_mm_s: round(nextEstimatedAppliedMmS, 4),
      image_velocity_px_s: round(nextImageVelocityPxS, 2),
      camera_velocity_px_s: round(feedforward.cameraVelocityPxS, 2),
      estimated_flame_velocity_px_s: round(feedforward.estimatedFlameVelocityPxS, 2),
    },
    controllerState: nextControllerState,
  }
}

function computeSmoothedImageVelocity(
  bottomYPx: number,
  controllerState: ControllerState,
  dtS: number,
  alpha: number,
): number {
  if (controllerState.lastBottomYPx === null || dtS <= 0) {
    return controllerState.imageVelocityPxS
  }

  const measuredVelocityPxS = (bottomYPx - controllerState.lastBottomYPx) / dtS
  const boundedAlpha = clamp(alpha, 0, 1)
  return (
    boundedAlpha * measuredVelocityPxS +
    (1 - boundedAlpha) * controllerState.imageVelocityPxS
  )
}

function computeFeedforward(
  imageVelocityPxS: number,
  estimatedAppliedMmS: number,
  options: ControllerOptions,
): {
  velocityMmS: number
  cameraVelocityPxS: number
  estimatedFlameVelocityPxS: number
} {
  if (
    !options.feedforwardEnabled ||
    options.mmPerPx <= 0 ||
    options.controlSign === 0
  ) {
    return {
      velocityMmS: 0,
      cameraVelocityPxS: 0,
      estimatedFlameVelocityPxS: imageVelocityPxS,
    }
  }

  const cameraVelocityPxS =
    estimatedAppliedMmS / (options.controlSign * options.mmPerPx)
  const estimatedFlameVelocityPxS = imageVelocityPxS + cameraVelocityPxS
  return {
    velocityMmS:
      options.controlSign *
      options.feedforwardGain *
      estimatedFlameVelocityPxS *
      options.mmPerPx,
    cameraVelocityPxS,
    estimatedFlameVelocityPxS,
  }
}

function moveToward(current: number, target: number, maxChange: number): number {
  if (current < target) return Math.min(current + maxChange, target)
  if (current > target) return Math.max(current - maxChange, target)
  return target
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
