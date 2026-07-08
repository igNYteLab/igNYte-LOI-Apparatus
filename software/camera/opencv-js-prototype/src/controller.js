export function computePRecommendation(
  detection,
  frameHeight,
  options,
  controllerState,
  nowMs,
) {
  return computeRecommendation(detection, frameHeight, options, controllerState, nowMs, {
    useIntegral: false,
  })
}

export function computePIRecommendation(
  detection,
  frameHeight,
  options,
  controllerState,
  nowMs,
) {
  return computeRecommendation(detection, frameHeight, options, controllerState, nowMs, {
    useIntegral: true,
  })
}

export function resetControllerState(
  lastUpdateMs = null,
  lastCommandedMmS = 0,
  estimatedAppliedMmS = 0,
) {
  return {
    integralErrorPxS: 0,
    lastUpdateMs,
    lastBottomYPx: null,
    imageVelocityPxS: 0,
    lastCommandedMmS,
    estimatedAppliedMmS,
  }
}

function computeRecommendation(
  detection,
  frameHeight,
  options,
  controllerState,
  nowMs,
  { useIntegral },
) {
  const setpointYPx = Math.round(frameHeight * options.setpointYNorm)
  const elapsedS =
    controllerState.lastUpdateMs !== null
      ? Math.max(0, (nowMs - controllerState.lastUpdateMs) / 1000)
      : 0
  const dtS = clamp(elapsedS, 0, 0.25)
  const nextEstimatedAppliedMmS = moveToward(
    controllerState.estimatedAppliedMmS,
    controllerState.lastCommandedMmS,
    options.motorAccelerationMmS2 * elapsedS,
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

  const unclampedVelocity = feedbackVelocityMmS + feedforwardVelocityMmS
  const velocityMmS = clamp(
    unclampedVelocity,
    -options.maxVelocityMmS,
    options.maxVelocityMmS,
  )
  const nextControllerState = {
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

function computeSmoothedImageVelocity(bottomYPx, controllerState, dtS, alpha) {
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

function computeFeedforward(imageVelocityPxS, estimatedAppliedMmS, options) {
  if (!options.feedforwardEnabled || options.mmPerPx <= 0 || options.controlSign === 0) {
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

function moveToward(current, target, maxChange) {
  if (current < target) {
    return Math.min(current + maxChange, target)
  }
  if (current > target) {
    return Math.max(current - maxChange, target)
  }
  return target
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function round(value, digits) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
