import {
  computePRecommendation,
  computePIRecommendation,
  resetControllerState as createControllerState,
} from "./controller.js"
import { DEFAULT_CONFIG } from "./config.js"
import { detectTarget } from "./detector.js"
import { buildTrackingMessage } from "./messages.js"
import { createSerialController, firmwareCommands } from "./serial.js"

const els = {
  opencvStatus: document.getElementById("opencvStatus"),
  cameraStatus: document.getElementById("cameraStatus"),
  serialStatus: document.getElementById("serialStatus"),
  cameraSelect: document.getElementById("cameraSelect"),
  refreshCamerasButton: document.getElementById("refreshCamerasButton"),
  startButton: document.getElementById("startButton"),
  stopButton: document.getElementById("stopButton"),
  widthInput: document.getElementById("widthInput"),
  heightInput: document.getElementById("heightInput"),
  fpsInput: document.getElementById("fpsInput"),
  brightHLow: document.getElementById("brightHLow"),
  brightHLowValue: document.getElementById("brightHLowValue"),
  brightHHigh: document.getElementById("brightHHigh"),
  brightHHighValue: document.getElementById("brightHHighValue"),
  brightSLow: document.getElementById("brightSLow"),
  brightSLowValue: document.getElementById("brightSLowValue"),
  brightSHigh: document.getElementById("brightSHigh"),
  brightSHighValue: document.getElementById("brightSHighValue"),
  brightVLow: document.getElementById("brightVLow"),
  brightVLowValue: document.getElementById("brightVLowValue"),
  brightVHigh: document.getElementById("brightVHigh"),
  brightVHighValue: document.getElementById("brightVHighValue"),
  hLow: document.getElementById("hLow"),
  hLowValue: document.getElementById("hLowValue"),
  hHigh: document.getElementById("hHigh"),
  hHighValue: document.getElementById("hHighValue"),
  sLow: document.getElementById("sLow"),
  sLowValue: document.getElementById("sLowValue"),
  sHigh: document.getElementById("sHigh"),
  sHighValue: document.getElementById("sHighValue"),
  vLow: document.getElementById("vLow"),
  vLowValue: document.getElementById("vLowValue"),
  vHigh: document.getElementById("vHigh"),
  vHighValue: document.getElementById("vHighValue"),
  minAreaInput: document.getElementById("minAreaInput"),
  kernelInput: document.getElementById("kernelInput"),
  setpointSlider: document.getElementById("setpointSlider"),
  setpointValue: document.getElementById("setpointValue"),
  controllerModeButton: document.getElementById("controllerModeButton"),
  deadbandInput: document.getElementById("deadbandInput"),
  kpInput: document.getElementById("kpInput"),
  kiInput: document.getElementById("kiInput"),
  feedforwardButton: document.getElementById("feedforwardButton"),
  feedforwardGainInput: document.getElementById("feedforwardGainInput"),
  mmPerPxInput: document.getElementById("mmPerPxInput"),
  maxVelocityInput: document.getElementById("maxVelocityInput"),
  controlSignSelect: document.getElementById("controlSignSelect"),
  processFpsInput: document.getElementById("processFpsInput"),
  exposureModeSelect: document.getElementById("exposureModeSelect"),
  exposureTimeInput: document.getElementById("exposureTimeInput"),
  whiteBalanceModeSelect: document.getElementById("whiteBalanceModeSelect"),
  colorTemperatureInput: document.getElementById("colorTemperatureInput"),
  applyCameraConstraintsButton: document.getElementById(
    "applyCameraConstraintsButton",
  ),
  connectSerialButton: document.getElementById("connectSerialButton"),
  disconnectSerialButton: document.getElementById("disconnectSerialButton"),
  motorStatusButton: document.getElementById("motorStatusButton"),
  driverStatusButton: document.getElementById("driverStatusButton"),
  motorEnableButton: document.getElementById("motorEnableButton"),
  motorCalibrateAxisButton: document.getElementById("motorCalibrateAxisButton"),
  motorStopButton: document.getElementById("motorStopButton"),
  motorDisableButton: document.getElementById("motorDisableButton"),
  sendRecommendationButton: document.getElementById("sendRecommendationButton"),
  autoControlButton: document.getElementById("autoControlButton"),
  lastCommandOutput: document.getElementById("lastCommandOutput"),
  video: document.getElementById("video"),
  frameCanvas: document.getElementById("frameCanvas"),
  overlayCanvas: document.getElementById("overlayCanvas"),
  maskCanvas: document.getElementById("maskCanvas"),
  jsonOutput: document.getElementById("jsonOutput"),
  cameraOutput: document.getElementById("cameraOutput"),
  serialOutput: document.getElementById("serialOutput"),
  trackingSummary: document.getElementById("trackingSummary"),
}

const state = {
  cvReady: false,
  stream: null,
  activeTrack: null,
  frameId: 0,
  processing: false,
  lastProcessMs: 0,
  animationId: null,
  latestRecommendation: null,
  latestTracking: null,
  serialConnected: false,
  autoControlEnabled: false,
  lastAutoControlMs: 0,
  autoControlSendActive: false,
  controllerMode: DEFAULT_CONFIG.controller.mode,
  feedforwardEnabled: DEFAULT_CONFIG.controller.feedforwardEnabled,
  controllerState: createControllerState(),
}

const serialController = createSerialController({
  onStatus: (text, tone) => setStatus(els.serialStatus, text, tone),
  onConnectedChange: updateSerialButtons,
  onLastCommand: (command) => {
    els.lastCommandOutput.value = command
  },
  onLog: (text) => {
    els.serialOutput.textContent = text
  },
})

boot()

async function boot() {
  applyDefaultConfig()
  bindSliderReadouts()
  bindEventHandlers()
  await Promise.all([waitForOpenCv(), refreshCameras()])
}

function bindEventHandlers() {
  els.refreshCamerasButton.addEventListener("click", () => void refreshCameras())
  els.startButton.addEventListener("click", () => void startCamera())
  els.stopButton.addEventListener("click", stopCamera)
  els.applyCameraConstraintsButton.addEventListener("click", () =>
    void applyCameraConstraints(),
  )
  els.connectSerialButton.addEventListener("click", () =>
    void serialController.connect(),
  )
  els.disconnectSerialButton.addEventListener("click", () =>
    void disconnectSerialSafely(),
  )
  els.motorStatusButton.addEventListener("click", () =>
    void serialController.sendCommand(firmwareCommands.motorStatus()),
  )
  els.driverStatusButton.addEventListener("click", () =>
    void serialController.sendCommand(firmwareCommands.driverStatus()),
  )
  els.motorEnableButton.addEventListener("click", () =>
    void serialController.sendCommand(firmwareCommands.motorEnable()),
  )
  els.motorCalibrateAxisButton.addEventListener("click", () =>
    void calibrateAxisSafely(),
  )
  els.motorStopButton.addEventListener("click", () =>
    void stopMotorSafely(),
  )
  els.motorDisableButton.addEventListener("click", () =>
    void disableMotorSafely(),
  )
  els.controllerModeButton.addEventListener("click", toggleControllerMode)
  els.feedforwardButton.addEventListener("click", toggleFeedforward)
  els.sendRecommendationButton.addEventListener("click", () =>
    void sendCurrentRecommendationSafely(),
  )
  els.autoControlButton.addEventListener("click", () => toggleAutoControl())
}

function toggleControllerMode() {
  state.controllerMode = state.controllerMode === "pi" ? "p" : "pi"
  resetControllerState()
  updateControllerModeButton()
}

function toggleFeedforward() {
  state.feedforwardEnabled = !state.feedforwardEnabled
  resetControllerState()
  updateFeedforwardButton()
}

function updateFeedforwardButton() {
  els.feedforwardButton.textContent = state.feedforwardEnabled
    ? "Feedforward On"
    : "Feedforward Off"
  els.feedforwardButton.classList.toggle("active", state.feedforwardEnabled)
}

function resetControllerState(
  lastCommandedMmS = state.controllerState.lastCommandedMmS,
  estimatedAppliedMmS = state.controllerState.estimatedAppliedMmS,
) {
  state.controllerState = createControllerState(
    null,
    lastCommandedMmS,
    estimatedAppliedMmS,
  )
}

function updateControllerModeButton() {
  const isPi = state.controllerMode === "pi"
  els.controllerModeButton.textContent = isPi ? "Controller: PI" : "Controller: P"
  els.controllerModeButton.classList.toggle("active", isPi)
}

function bindSliderReadouts() {
  const bindings = [
    [els.brightHLow, els.brightHLowValue, (value) => value],
    [els.brightHHigh, els.brightHHighValue, (value) => value],
    [els.brightSLow, els.brightSLowValue, (value) => value],
    [els.brightSHigh, els.brightSHighValue, (value) => value],
    [els.brightVLow, els.brightVLowValue, (value) => value],
    [els.brightVHigh, els.brightVHighValue, (value) => value],
    [els.hLow, els.hLowValue, (value) => value],
    [els.hHigh, els.hHighValue, (value) => value],
    [els.sLow, els.sLowValue, (value) => value],
    [els.sHigh, els.sHighValue, (value) => value],
    [els.vLow, els.vLowValue, (value) => value],
    [els.vHigh, els.vHighValue, (value) => value],
    [
      els.setpointSlider,
      els.setpointValue,
      (value) => `${(Number(value) / 10).toFixed(1)}%`,
    ],
  ]

  for (const [input, output, format] of bindings) {
    const update = () => {
      const formattedValue = format(input.value)
      output.value = formattedValue
      output.textContent = formattedValue
    }
    input.addEventListener("input", update)
    update()
  }
}

function applyDefaultConfig() {
  els.widthInput.value = DEFAULT_CONFIG.camera.widthPx
  els.heightInput.value = DEFAULT_CONFIG.camera.heightPx
  els.fpsInput.value = DEFAULT_CONFIG.camera.fps

  els.brightHLow.value = DEFAULT_CONFIG.detector.brightHsvLow.h
  els.brightHHigh.value = DEFAULT_CONFIG.detector.brightHsvHigh.h
  els.brightSLow.value = DEFAULT_CONFIG.detector.brightHsvLow.s
  els.brightSHigh.value = DEFAULT_CONFIG.detector.brightHsvHigh.s
  els.brightVLow.value = DEFAULT_CONFIG.detector.brightHsvLow.v
  els.brightVHigh.value = DEFAULT_CONFIG.detector.brightHsvHigh.v
  els.hLow.value = DEFAULT_CONFIG.detector.coloredHsvLow.h
  els.hHigh.value = DEFAULT_CONFIG.detector.coloredHsvHigh.h
  els.sLow.value = DEFAULT_CONFIG.detector.coloredHsvLow.s
  els.sHigh.value = DEFAULT_CONFIG.detector.coloredHsvHigh.s
  els.vLow.value = DEFAULT_CONFIG.detector.coloredHsvLow.v
  els.vHigh.value = DEFAULT_CONFIG.detector.coloredHsvHigh.v
  els.minAreaInput.value = DEFAULT_CONFIG.detector.minAreaPx
  els.kernelInput.value = DEFAULT_CONFIG.detector.kernelSizePx

  els.setpointSlider.value = Math.round(
    DEFAULT_CONFIG.controller.setpointYNorm * 1000,
  )
  els.deadbandInput.value = DEFAULT_CONFIG.controller.deadbandPx
  els.kpInput.value = DEFAULT_CONFIG.controller.kpMmSPerPx
  els.kiInput.value = DEFAULT_CONFIG.controller.kiMmSPerPxS
  els.feedforwardGainInput.value = DEFAULT_CONFIG.controller.feedforwardGain
  els.mmPerPxInput.value = DEFAULT_CONFIG.controller.mmPerPx
  els.maxVelocityInput.value = DEFAULT_CONFIG.controller.maxVelocityMmS
  els.controlSignSelect.value = String(DEFAULT_CONFIG.controller.controlSign)
  els.processFpsInput.value = DEFAULT_CONFIG.controller.processFps
  updateControllerModeButton()
  updateFeedforwardButton()
}

function waitForOpenCv() {
  return new Promise((resolve) => {
    const check = () => {
      if (window.cv?.Mat) {
        if (window.cv.getBuildInformation) {
          markOpenCvReady(resolve)
        } else {
          window.cv.onRuntimeInitialized = () => markOpenCvReady(resolve)
        }
      } else {
        window.setTimeout(check, 50)
      }
    }
    check()
  })
}

function markOpenCvReady(resolve) {
  state.cvReady = true
  setStatus(els.opencvStatus, "OpenCV ready", "good")
  resolve()
}

async function refreshCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    els.cameraSelect.innerHTML = "<option>No mediaDevices support</option>"
    return
  }

  let devices = await navigator.mediaDevices.enumerateDevices()
  let cameras = devices.filter((device) => device.kind === "videoinput")

  if (!cameras.length) {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      })
      tempStream.getTracks().forEach((track) => track.stop())
      devices = await navigator.mediaDevices.enumerateDevices()
      cameras = devices.filter((device) => device.kind === "videoinput")
    } catch {
      // Permission may be denied. The start button will surface the real error.
    }
  }

  els.cameraSelect.innerHTML = ""
  if (!cameras.length) {
    const option = document.createElement("option")
    option.value = ""
    option.textContent = "No camera found"
    els.cameraSelect.append(option)
    return
  }

  for (const [index, camera] of cameras.entries()) {
    const option = document.createElement("option")
    option.value = camera.deviceId
    option.textContent = camera.label || `Camera ${index + 1}`
    els.cameraSelect.append(option)
  }
}

async function startCamera() {
  if (!state.cvReady) return
  stopCamera()

  const width = numberValue(els.widthInput, DEFAULT_CONFIG.camera.widthPx)
  const height = numberValue(els.heightInput, DEFAULT_CONFIG.camera.heightPx)
  const fps = numberValue(els.fpsInput, DEFAULT_CONFIG.camera.fps)
  const deviceId = els.cameraSelect.value

  setStatus(els.cameraStatus, "Camera starting", "muted")
  const videoConstraints = {
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: fps },
  }
  if (deviceId) {
    videoConstraints.deviceId = { exact: deviceId }
  }

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    })
    state.activeTrack = state.stream.getVideoTracks()[0] ?? null
    els.video.srcObject = state.stream
    await els.video.play()
    await refreshCameras()
    resizeCanvases()
    updateCameraOutput()
    els.startButton.disabled = true
    els.stopButton.disabled = false
    els.applyCameraConstraintsButton.disabled = !state.activeTrack
    setStatus(els.cameraStatus, "Camera running", "good")
    resetControllerState(0, 0)
    state.processing = true
    state.lastProcessMs = 0
    state.animationId = requestAnimationFrame(processLoop)
  } catch (err) {
    setStatus(els.cameraStatus, "Camera failed", "bad")
    els.cameraOutput.textContent =
      err instanceof Error ? err.message : "Unable to start camera."
  }
}

function stopCamera() {
  if (state.autoControlEnabled) {
    void stopAutoControl()
  }

  state.processing = false
  if (state.animationId !== null) {
    cancelAnimationFrame(state.animationId)
    state.animationId = null
  }
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop())
  }
  state.stream = null
  state.activeTrack = null
  els.video.srcObject = null
  els.startButton.disabled = false
  els.stopButton.disabled = true
  els.applyCameraConstraintsButton.disabled = true
  resetControllerState(0, 0)
  setStatus(els.cameraStatus, "Camera stopped", "muted")
}

function processLoop(nowMs) {
  if (!state.processing) return
  state.animationId = requestAnimationFrame(processLoop)

  const processFps = Math.max(
    1,
    numberValue(els.processFpsInput, DEFAULT_CONFIG.controller.processFps),
  )
  if (nowMs - state.lastProcessMs < 1000 / processFps) return
  state.lastProcessMs = nowMs

  if (!els.video.videoWidth || !els.video.videoHeight) return
  resizeCanvases()

  const frameContext = els.frameCanvas.getContext("2d", {
    willReadFrequently: true,
  })
  const overlayContext = els.overlayCanvas.getContext("2d")
  frameContext.drawImage(
    els.video,
    0,
    0,
    els.frameCanvas.width,
    els.frameCanvas.height,
  )
  overlayContext.drawImage(
    els.video,
    0,
    0,
    els.overlayCanvas.width,
    els.overlayCanvas.height,
  )

  const detectorOptions = readDetectorOptions()
  const { detection, mask } = detectTarget(window.cv, els.frameCanvas, detectorOptions)
  try {
    window.cv.imshow(els.maskCanvas, mask)
  } finally {
    mask.delete()
  }

  const controlOptions = readControlOptions()
  const { setpointYPx, errorYPx, recommendation } = computeControllerRecommendation(
    detection,
    els.frameCanvas.height,
    controlOptions,
    nowMs,
  )
  drawOverlay(overlayContext, detection, setpointYPx, errorYPx, recommendation)

  state.frameId += 1
  const message = buildTrackingMessage({
    frameId: state.frameId,
    frameWidth: els.frameCanvas.width,
    frameHeight: els.frameCanvas.height,
    detection,
    setpointYPx,
    setpointYNorm: controlOptions.setpointYNorm,
    errorYPx,
    recommendation,
  })
  state.latestRecommendation = message.recommendation
  state.latestTracking = message
  els.jsonOutput.textContent = JSON.stringify(message, null, 2)
  els.trackingSummary.textContent = detection.tracking
    ? `tracking conf ${detection.confidence.toFixed(2)} error ${errorYPx}px`
    : "tracking lost"

  if (shouldSendAutoControl(nowMs)) {
    state.lastAutoControlMs = nowMs
    void sendAutoControlRecommendation()
  }
}

function computeControllerRecommendation(detection, frameHeight, controlOptions, nowMs) {
  if (controlOptions.mode === "pi") {
    const result = computePIRecommendation(
      detection,
      frameHeight,
      controlOptions,
      state.controllerState,
      nowMs,
    )
    state.controllerState = result.controllerState
    return result
  }

  const result = computePRecommendation(
    detection,
    frameHeight,
    controlOptions,
    state.controllerState,
    nowMs,
  )
  state.controllerState = result.controllerState
  return result
}

function updateSerialButtons(connected) {
  state.serialConnected = connected
  if (!connected) {
    setAutoControlEnabled(false)
  }

  els.connectSerialButton.disabled = connected
  els.disconnectSerialButton.disabled = !connected
  els.motorStatusButton.disabled = !connected
  els.driverStatusButton.disabled = !connected
  els.motorEnableButton.disabled = !connected
  els.motorCalibrateAxisButton.disabled = !connected
  els.motorStopButton.disabled = !connected
  els.motorDisableButton.disabled = !connected
  els.sendRecommendationButton.disabled = !connected
  els.autoControlButton.disabled = !connected
}

function toggleAutoControl() {
  if (!state.serialConnected) return

  const nextEnabled = !state.autoControlEnabled
  setAutoControlEnabled(nextEnabled)
  if (!nextEnabled) {
    void stopAutoControl()
  }
}

function setAutoControlEnabled(enabled) {
  state.autoControlEnabled = enabled
  state.lastAutoControlMs = 0
  resetControllerState()
  els.autoControlButton.textContent = enabled
    ? "Auto Control On"
    : "Auto Control Off"
  els.autoControlButton.classList.toggle("active", enabled)
}

function shouldSendAutoControl(nowMs) {
  if (!state.autoControlEnabled || state.autoControlSendActive) {
    return false
  }

  const autoControlHz = Math.max(1, DEFAULT_CONFIG.controller.autoControlHz)
  return nowMs - state.lastAutoControlMs >= 1000 / autoControlHz
}

async function sendAutoControlRecommendation() {
  state.autoControlSendActive = true
  try {
    await sendCurrentRecommendationSafely()
  } finally {
    state.autoControlSendActive = false
  }
}

async function sendCurrentRecommendationSafely() {
  await serialController.sendCurrentRecommendation(
    state.latestTracking,
    state.latestRecommendation,
  )
  updateLastCommandedVelocity(state.latestTracking, state.latestRecommendation)
}

async function stopAutoControl() {
  setAutoControlEnabled(false)
  if (state.serialConnected) {
    await serialController.sendCommand(firmwareCommands.motorVelocityMmS(0))
    setLastCommandedVelocity(0, true)
  }
}

async function stopMotorSafely() {
  if (state.autoControlEnabled) {
    await stopAutoControl()
  }
  await serialController.sendCommand(firmwareCommands.motorStop())
  setLastCommandedVelocity(0, true)
}

async function calibrateAxisSafely() {
  serialController.appendLine("calibrate clicked")
  if (state.autoControlEnabled) {
    await stopAutoControl()
  }
  await serialController.sendCommand(firmwareCommands.motorCalibrateAxis())
  setLastCommandedVelocity(0, true)
}

async function disableMotorSafely() {
  if (state.autoControlEnabled) {
    await stopAutoControl()
  }
  await serialController.sendCommand(firmwareCommands.motorDisable())
  setLastCommandedVelocity(0, true)
}

async function disconnectSerialSafely() {
  if (state.autoControlEnabled) {
    await stopAutoControl()
  }
  await serialController.disconnect()
  setLastCommandedVelocity(0, true)
}

function updateLastCommandedVelocity(tracking, recommendation) {
  if (tracking?.tracking && tracking.confidence >= 0.5 && recommendation) {
    setLastCommandedVelocity(recommendation.velocity_mm_s)
  } else {
    setLastCommandedVelocity(0, true)
  }
}

function setLastCommandedVelocity(velocityMmS, immediate = false) {
  if (immediate) {
    resetControllerState(0, 0)
    return
  }

  state.controllerState = {
    ...state.controllerState,
    lastCommandedMmS: velocityMmS,
  }
}

function resizeCanvases() {
  const width =
    els.video.videoWidth || numberValue(els.widthInput, DEFAULT_CONFIG.camera.widthPx)
  const height =
    els.video.videoHeight ||
    numberValue(els.heightInput, DEFAULT_CONFIG.camera.heightPx)
  for (const canvas of [els.frameCanvas, els.overlayCanvas, els.maskCanvas]) {
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
  }
}

function readDetectorOptions() {
  let kernelSizePx = numberValue(els.kernelInput, 5)
  if (kernelSizePx % 2 === 0) kernelSizePx += 1
  return {
    brightHsvLow: [
      numberValue(els.brightHLow, DEFAULT_CONFIG.detector.brightHsvLow.h),
      numberValue(els.brightSLow, DEFAULT_CONFIG.detector.brightHsvLow.s),
      numberValue(els.brightVLow, DEFAULT_CONFIG.detector.brightHsvLow.v),
      0,
    ],
    brightHsvHigh: [
      numberValue(els.brightHHigh, DEFAULT_CONFIG.detector.brightHsvHigh.h),
      numberValue(els.brightSHigh, DEFAULT_CONFIG.detector.brightHsvHigh.s),
      numberValue(els.brightVHigh, DEFAULT_CONFIG.detector.brightHsvHigh.v),
      255,
    ],
    coloredHsvLow: [
      numberValue(els.hLow, DEFAULT_CONFIG.detector.coloredHsvLow.h),
      numberValue(els.sLow, DEFAULT_CONFIG.detector.coloredHsvLow.s),
      numberValue(els.vLow, DEFAULT_CONFIG.detector.coloredHsvLow.v),
      0,
    ],
    coloredHsvHigh: [
      numberValue(els.hHigh, DEFAULT_CONFIG.detector.coloredHsvHigh.h),
      numberValue(els.sHigh, DEFAULT_CONFIG.detector.coloredHsvHigh.s),
      numberValue(els.vHigh, DEFAULT_CONFIG.detector.coloredHsvHigh.v),
      255,
    ],
    minAreaPx: numberValue(
      els.minAreaInput,
      DEFAULT_CONFIG.detector.minAreaPx,
    ),
    kernelSizePx,
  }
}

function readControlOptions() {
  return {
    mode: state.controllerMode,
    setpointYNorm:
      numberValue(
        els.setpointSlider,
        DEFAULT_CONFIG.controller.setpointYNorm * 1000,
      ) / 1000,
    deadbandPx: numberValue(
      els.deadbandInput,
      DEFAULT_CONFIG.controller.deadbandPx,
    ),
    kpMmSPerPx: numberValue(
      els.kpInput,
      DEFAULT_CONFIG.controller.kpMmSPerPx,
    ),
    kiMmSPerPxS: numberValue(
      els.kiInput,
      DEFAULT_CONFIG.controller.kiMmSPerPxS,
    ),
    maxIntegralErrorPxS: DEFAULT_CONFIG.controller.maxIntegralErrorPxS,
    feedforwardEnabled: state.feedforwardEnabled,
    feedforwardGain: numberValue(
      els.feedforwardGainInput,
      DEFAULT_CONFIG.controller.feedforwardGain,
    ),
    mmPerPx: numberValue(els.mmPerPxInput, DEFAULT_CONFIG.controller.mmPerPx),
    imageVelocityAlpha: DEFAULT_CONFIG.controller.imageVelocityAlpha,
    motorAccelerationMmS2: DEFAULT_CONFIG.controller.motorAccelerationMmS2,
    maxVelocityMmS: numberValue(
      els.maxVelocityInput,
      DEFAULT_CONFIG.controller.maxVelocityMmS,
    ),
    controlSign: Number(els.controlSignSelect.value) || 1,
  }
}

function drawOverlay(context, detection, setpointYPx, errorYPx, recommendation) {
  const width = context.canvas.width
  const height = context.canvas.height
  context.save()
  context.lineWidth = Math.max(2, Math.round(width / 640))

  context.strokeStyle = "#4ca3ff"
  context.beginPath()
  context.moveTo(0, setpointYPx)
  context.lineTo(width, setpointYPx)
  context.stroke()

  if (detection.tracking) {
    context.strokeStyle = "#f5b642"
    context.beginPath()
    for (const [index, point] of detection.contour.entries()) {
      if (index === 0) context.moveTo(point.x, point.y)
      else context.lineTo(point.x, point.y)
    }
    context.closePath()
    context.stroke()

    context.strokeStyle = "#5ee38b"
    context.strokeRect(
      detection.bbox.x,
      detection.bbox.y,
      detection.bbox.width,
      detection.bbox.height,
    )

    context.fillStyle = "#ff4d4d"
    context.beginPath()
    context.arc(detection.bottomXPx, detection.bottomYPx, 8, 0, Math.PI * 2)
    context.fill()
  }

  context.fillStyle = "rgba(0, 0, 0, 0.72)"
  context.fillRect(12, 12, 500, recommendation?.feedforward_velocity_mm_s ? 150 : 104)
  context.fillStyle = "#ffffff"
  context.font = "24px ui-monospace, SFMono-Regular, Consolas, monospace"
  const lines = detection.tracking
    ? [
        `tracking true  confidence ${detection.confidence.toFixed(2)}`,
        `bottom_y ${detection.bottomYPx}px  setpoint ${setpointYPx}px`,
        `error ${errorYPx}px`,
        recommendation
          ? `velocity ${recommendation.velocity_mm_s} mm/s`
          : "velocity null",
        recommendation?.feedforward_velocity_mm_s
          ? `fb ${recommendation.feedback_velocity_mm_s} ff ${recommendation.feedforward_velocity_mm_s} mm/s`
          : null,
        recommendation?.estimated_flame_velocity_px_s
          ? `est flame v ${recommendation.estimated_flame_velocity_px_s} px/s`
          : null,
      ]
        .filter(Boolean)
    : ["tracking false", `setpoint ${setpointYPx}px`, "velocity null"]

  for (let i = 0; i < lines.length; i += 1) {
    context.fillText(lines[i], 24, 40 + i * 23)
  }
  context.restore()
}

async function applyCameraConstraints() {
  const track = state.activeTrack
  if (!track?.applyConstraints) return

  const advanced = {}
  if (els.exposureModeSelect.value) {
    advanced.exposureMode = els.exposureModeSelect.value
  }
  if (els.exposureTimeInput.value.trim()) {
    advanced.exposureTime = Number(els.exposureTimeInput.value)
  }
  if (els.whiteBalanceModeSelect.value) {
    advanced.whiteBalanceMode = els.whiteBalanceModeSelect.value
  }
  if (els.colorTemperatureInput.value.trim()) {
    advanced.colorTemperature = Number(els.colorTemperatureInput.value)
  }

  try {
    await track.applyConstraints({ advanced: [advanced] })
  } catch (err) {
    els.cameraOutput.textContent = `Constraint apply failed:\n${
      err instanceof Error ? err.message : String(err)
    }\n\n${cameraReport(track)}`
    return
  }
  updateCameraOutput()
}

function updateCameraOutput() {
  els.cameraOutput.textContent = state.activeTrack
    ? cameraReport(state.activeTrack)
    : "Camera not started."
}

function cameraReport(track) {
  const capabilities =
    typeof track.getCapabilities === "function" ? track.getCapabilities() : {}
  const settings = typeof track.getSettings === "function" ? track.getSettings() : {}
  return JSON.stringify({ settings, capabilities }, null, 2)
}

function numberValue(input, fallback) {
  const parsed = Number(input.value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function setStatus(element, text, tone) {
  element.textContent = text
  element.classList.toggle("muted", tone === "muted")
  element.classList.toggle("bad", tone === "bad")
}
