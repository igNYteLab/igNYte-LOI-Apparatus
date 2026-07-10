"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { fw } from "@/lib/firmware"
import {
  DEFAULT_VISION_CONFIG,
  MIN_AUTO_CONTROL_CONFIDENCE,
  type CameraOptions,
  type ControllerOptions,
  type DetectorOptions,
  type VisionConfig,
} from "@/lib/vision/config"
import {
  computePIRecommendation,
  computePRecommendation,
  noteCommandedVelocity,
  resetControllerState,
  type ControllerState,
  type Recommendation,
} from "@/lib/vision/controller"
import type { Detection } from "@/lib/vision/detector"
import { buildTrackingMessage, type TrackingMessage } from "@/lib/vision/messages"
import type { VisionRuntime } from "@/lib/vision/opencv-types"

// If the process loop hasn't produced a fresh frame within this window, the
// auto-control fail-safe sends zero velocity (e.g. the operator left the tab).
const STALE_MS = 500
const MASK_EVERY_N_FRAMES = 4

export type CameraConstraintValues = {
  exposureMode: string
  exposureTime: string
  whiteBalanceMode: string
  colorTemperature: string
}

export type TrackerStatus = {
  tracking: boolean
  confidence: number
  errorYPx: number | null
  recommendation: Recommendation
  setpointYPx: number
  processedFps: number
  message: TrackingMessage | null
}

/** Recommendation → a `motor.velocity_mm_s` command (null ⇒ 0, i.e. stop). */
function velocityCommand(rec: Recommendation): string {
  return fw.motorVelocity(rec ? rec.velocity_mm_s : 0)
}

function drawOverlay(
  canvas: HTMLCanvasElement | null,
  sourceCanvas: HTMLCanvasElement,
  detection: Detection,
  setpointYPx: number,
) {
  if (!canvas) return
  if (canvas.width !== sourceCanvas.width) canvas.width = sourceCanvas.width
  if (canvas.height !== sourceCanvas.height) canvas.height = sourceCanvas.height
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height)

  // Setpoint line.
  ctx.strokeStyle = "rgba(56,189,248,0.9)"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, setpointYPx)
  ctx.lineTo(canvas.width, setpointYPx)
  ctx.stroke()

  if (!detection.tracking) return

  // Bounding box.
  ctx.strokeStyle = "rgba(34,197,94,0.9)"
  ctx.lineWidth = 2
  ctx.strokeRect(
    detection.bbox.x,
    detection.bbox.y,
    detection.bbox.width,
    detection.bbox.height,
  )

  // Contour.
  if (detection.contour.length) {
    ctx.strokeStyle = "rgba(250,204,21,0.9)"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    detection.contour.forEach((p, i) =>
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
    )
    ctx.closePath()
    ctx.stroke()
  }

  // Bottom point (the control target).
  ctx.fillStyle = "rgba(239,68,68,0.95)"
  ctx.beginPath()
  ctx.arc(detection.bottomXPx, detection.bottomYPx, 5, 0, Math.PI * 2)
  ctx.fill()
}

type CameraAdvancedConstraints = MediaTrackConstraintSet & {
  exposureMode?: string
  exposureTime?: number
  whiteBalanceMode?: string
  colorTemperature?: number
}

function cameraReport(track: MediaStreamTrack | null) {
  if (!track) return "Camera not started."
  const capabilities =
    typeof track.getCapabilities === "function" ? track.getCapabilities() : {}
  const settings = typeof track.getSettings === "function" ? track.getSettings() : {}
  return JSON.stringify({ settings, capabilities }, null, 2)
}

function drawMask(canvas: HTMLCanvasElement | null, mask: ImageData) {
  if (!canvas) return
  if (canvas.width !== mask.width) canvas.width = mask.width
  if (canvas.height !== mask.height) canvas.height = mask.height
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.putImageData(mask, 0, 0)
}

export function useFlameTracker(params: {
  cv: VisionRuntime | null
  connected: boolean
  sendCommand: (command: string) => Promise<void>
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const [config, setConfig] = useState<VisionConfig>(DEFAULT_VISION_CONFIG)
  const [running, setRunning] = useState(false)
  const [autoControl, setAutoControl] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraControlError, setCameraControlError] = useState<string | null>(null)
  const [cameraReportText, setCameraReportText] = useState("Camera not started.")
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([])
  const [cameraDeviceId, setCameraDeviceId] = useState("")
  const [status, setStatus] = useState<TrackerStatus>({
    tracking: false,
    confidence: 0,
    errorYPx: null,
    recommendation: null,
    setpointYPx: 0,
    processedFps: 0,
    message: null,
  })

  // Mirrors so the loop/interval always read the latest without re-subscribing.
  // Updated in an effect (after render) to satisfy react-hooks/refs.
  const cvRef = useRef(params.cv)
  const configRef = useRef(config)
  const connectedRef = useRef(params.connected)
  const sendRef = useRef(params.sendCommand)
  const runningRef = useRef(false)
  const autoRef = useRef(false)

  useEffect(() => {
    cvRef.current = params.cv
    configRef.current = config
    connectedRef.current = params.connected
    sendRef.current = params.sendCommand
  })

  const streamRef = useRef<MediaStream | null>(null)
  const activeTrackRef = useRef<MediaStreamTrack | null>(null)
  const lastProcessMsRef = useRef(0)
  const lastStatusMsRef = useRef(0)
  const frameIdRef = useRef(0)
  const processBusyRef = useRef(false)
  const controllerStateRef = useRef<ControllerState>(resetControllerState())
  const emaFpsRef = useRef(0)
  const autoSendBusyRef = useRef(false)
  const latestRef = useRef<{
    atMs: number
    detection: Detection | null
    recommendation: Recommendation
  }>({ atMs: 0, detection: null, recommendation: null })

  const refreshCameraReport = useCallback(() => {
    setCameraReportText(cameraReport(activeTrackRef.current))
  }, [])

  const enumerateCameraDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setCameraDevices([])
      return
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter((device) => device.kind === "videoinput")
      setCameraDevices(videoDevices)
      setCameraDeviceId((current) => {
        if (current && videoDevices.some((device) => device.deviceId === current)) {
          return current
        }
        return videoDevices[0]?.deviceId ?? ""
      })
    } catch {
      setCameraDevices([])
    }
  }, [])

  useEffect(() => {
    void enumerateCameraDevices()
    navigator.mediaDevices?.addEventListener?.("devicechange", enumerateCameraDevices)
    return () => {
      navigator.mediaDevices?.removeEventListener?.(
        "devicechange",
        enumerateCameraDevices,
      )
    }
  }, [enumerateCameraDevices])

  // ---- Fail-safe auto-control sender (independent of the video loop) --------
  useEffect(() => {
    const hz = Math.max(1, config.controller.autoControlHz)
    const id = window.setInterval(() => {
      if (!autoRef.current || !connectedRef.current || autoSendBusyRef.current) {
        return
      }
      const now = performance.now()
      const latest = latestRef.current
      const fresh = now - latest.atMs <= STALE_MS
      const rec =
        fresh &&
        latest.detection?.tracking &&
        latest.detection.confidence >= MIN_AUTO_CONTROL_CONFIDENCE
          ? latest.recommendation
          : null
      autoSendBusyRef.current = true
      const commandedMmS = rec ? rec.velocity_mm_s : 0
      void sendRef.current(velocityCommand(rec))
        .then(() => {
          controllerStateRef.current = noteCommandedVelocity(
            controllerStateRef.current,
            commandedMmS,
          )
        })
        .catch(() => {})
        .finally(() => {
          autoSendBusyRef.current = false
        })
    }, 1000 / hz)
    return () => window.clearInterval(id)
  }, [config.controller.autoControlHz])

  // ---- Processing (one frame) ----------------------------------------------
  const processFrameOnce = useCallback(() => {
    const vision = cvRef.current
    const video = videoRef.current
    const frame = frameCanvasRef.current
    if (!vision || !video || !frame || !runningRef.current) return

    const cfg = configRef.current
    const now = performance.now()
    const sinceLast = now - lastProcessMsRef.current
    if (sinceLast < 1000 / Math.max(1, cfg.controller.processFps)) return
    if (processBusyRef.current) return
    lastProcessMsRef.current = now
    if (video.readyState < 2 || !video.videoWidth) return

    const analysisWidth = Math.max(
      1,
      Math.min(cfg.camera.analysisWidthPx, video.videoWidth),
    )
    const analysisHeight = Math.max(
      1,
      Math.min(cfg.camera.analysisHeightPx, video.videoHeight),
    )
    if (frame.width !== analysisWidth) frame.width = analysisWidth
    if (frame.height !== analysisHeight) frame.height = analysisHeight
    const fctx = frame.getContext("2d", { willReadFrequently: true })
    if (!fctx) return
    fctx.drawImage(video, 0, 0, frame.width, frame.height)
    const imageData = fctx.getImageData(0, 0, frame.width, frame.height)
    processBusyRef.current = true
    const includeMask = frameIdRef.current % MASK_EVERY_N_FRAMES === 0

    void vision
      .detect(imageData, cfg.detector, includeMask)
      .then(({ detection, mask }) => {
        if (!runningRef.current) return
        const result =
          cfg.controller.mode === "pi"
            ? computePIRecommendation(
                detection,
                frame.height,
                cfg.controller,
                controllerStateRef.current,
                now,
              )
            : computePRecommendation(
                detection,
                frame.height,
                cfg.controller,
                controllerStateRef.current,
                now,
              )
        controllerStateRef.current = result.controllerState

        frameIdRef.current += 1
        const message = buildTrackingMessage({
          frameId: frameIdRef.current,
          frameWidth: frame.width,
          frameHeight: frame.height,
          detection,
          setpointYPx: result.setpointYPx,
          setpointYNorm: cfg.controller.setpointYNorm,
          errorYPx: result.errorYPx,
          recommendation: result.recommendation,
        })

        latestRef.current = {
          atMs: now,
          detection,
          recommendation: result.recommendation,
        }

        drawOverlay(overlayCanvasRef.current, frame, detection, result.setpointYPx)
        if (mask) drawMask(maskCanvasRef.current, mask)

        const instFps = sinceLast > 0 ? 1000 / sinceLast : 0
        emaFpsRef.current = emaFpsRef.current
          ? emaFpsRef.current * 0.8 + instFps * 0.2
          : instFps

        // Throttle React status updates (~5 Hz) so the control panel doesn't
        // re-render on every processed frame; the canvases already drew above.
        if (now - lastStatusMsRef.current >= 200) {
          lastStatusMsRef.current = now
          setStatus({
            tracking: detection.tracking,
            confidence: detection.confidence,
            errorYPx: result.errorYPx,
            recommendation: result.recommendation,
            setpointYPx: result.setpointYPx,
            processedFps: emaFpsRef.current,
            message,
          })
        }
      })
      .catch((err: unknown) => {
        setCameraError(
          err instanceof Error ? err.message : "Vision worker detection failed",
        )
      })
      .finally(() => {
        processBusyRef.current = false
      })
  }, [])

  // Drive processing with requestAnimationFrame while the camera runs.
  useEffect(() => {
    if (!running) return
    let raf = requestAnimationFrame(function tick() {
      raf = requestAnimationFrame(tick)
      processFrameOnce()
    })
    return () => cancelAnimationFrame(raf)
  }, [running, processFrameOnce])

  // ---- Camera control -------------------------------------------------------
  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API unavailable — use Chrome/Edge over HTTPS or localhost.")
      }
      const cam = configRef.current.camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(cameraDeviceId ? { deviceId: { exact: cameraDeviceId } } : {}),
          width: { ideal: cam.widthPx },
          height: { ideal: cam.heightPx },
          frameRate: { ideal: cam.fps },
        },
        audio: false,
      })
      streamRef.current = stream
      activeTrackRef.current = stream.getVideoTracks()[0] ?? null
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play().catch(() => {})
      }
      controllerStateRef.current = resetControllerState()
      setCameraReportText(cameraReport(activeTrackRef.current))
      void enumerateCameraDevices()
      runningRef.current = true
      setRunning(true)
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "Failed to start camera")
      runningRef.current = false
      setRunning(false)
    }
  }, [cameraDeviceId, enumerateCameraDevices])

  const stopCamera = useCallback(() => {
    runningRef.current = false
    setRunning(false)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    activeTrackRef.current = null
    setCameraReportText("Camera not started.")
    const video = videoRef.current
    if (video) video.srcObject = null
    controllerStateRef.current = resetControllerState()
    latestRef.current = { atMs: 0, detection: null, recommendation: null }
    // Safety: stopping the camera stops auto motion.
    if (autoRef.current) {
      if (connectedRef.current) void sendRef.current(velocityCommand(null)).catch(() => {})
      autoRef.current = false
      setAutoControl(false)
    }
  }, [])

  // ---- Auto-control + manual sends -----------------------------------------
  const setAutoControlOn = useCallback((next: boolean) => {
    if (next) {
      if (!connectedRef.current) return
      controllerStateRef.current = resetControllerState()
      autoRef.current = true
      setAutoControl(true)
    } else {
      if (connectedRef.current) void sendRef.current(velocityCommand(null)).catch(() => {})
      controllerStateRef.current = resetControllerState()
      autoRef.current = false
      setAutoControl(false)
    }
  }, [])

  const sendOnce = useCallback(() => {
    if (!connectedRef.current) return
    const now = performance.now()
    const latest = latestRef.current
    const fresh = now - latest.atMs <= STALE_MS
    const rec =
      fresh &&
      latest.detection?.tracking &&
      latest.detection.confidence >= MIN_AUTO_CONTROL_CONFIDENCE
        ? latest.recommendation
        : null
    const commandedMmS = rec ? rec.velocity_mm_s : 0
    void sendRef.current(velocityCommand(rec))
      .then(() => {
        controllerStateRef.current = noteCommandedVelocity(
          controllerStateRef.current,
          commandedMmS,
        )
      })
      .catch(() => {})
  }, [])

  const calibrate = useCallback(() => {
    if (!connectedRef.current) return
    // Auto control off first for safety.
    if (autoRef.current) {
      autoRef.current = false
      setAutoControl(false)
      void sendRef.current(velocityCommand(null)).catch(() => {})
    }
    void sendRef.current(fw.motorCalibrateAxis()).catch(() => {})
  }, [])

  const applyCameraConstraints = useCallback(
    async (values: CameraConstraintValues) => {
      const track = activeTrackRef.current
      if (!track?.applyConstraints) {
        setCameraControlError("Camera constraints are unavailable for this source.")
        return
      }

      const advanced: CameraAdvancedConstraints = {}
      if (values.exposureMode) advanced.exposureMode = values.exposureMode
      if (values.exposureTime.trim()) {
        advanced.exposureTime = Number(values.exposureTime)
      }
      if (values.whiteBalanceMode) {
        advanced.whiteBalanceMode = values.whiteBalanceMode
      }
      if (values.colorTemperature.trim()) {
        advanced.colorTemperature = Number(values.colorTemperature)
      }

      try {
        await track.applyConstraints({ advanced: [advanced] })
        setCameraControlError(null)
      } catch (err) {
        setCameraControlError(
          err instanceof Error ? err.message : "Failed to apply camera controls",
        )
      } finally {
        setCameraReportText(cameraReport(track))
      }
    },
    [],
  )

  /** Called by the E-STOP: just drop auto control (E-STOP already halts motion). */
  const disableAutoControl = useCallback(() => {
    controllerStateRef.current = resetControllerState()
    autoRef.current = false
    setAutoControl(false)
  }, [])

  // ---- Config patchers ------------------------------------------------------
  const patchController = useCallback(
    (partial: Partial<ControllerOptions>) => {
      const state = controllerStateRef.current
      controllerStateRef.current = resetControllerState(
        null,
        state.lastCommandedMmS,
        state.estimatedAppliedMmS,
      )
      setConfig((c) => ({ ...c, controller: { ...c.controller, ...partial } }))
    },
    [],
  )
  const patchCamera = useCallback(
    (partial: Partial<CameraOptions>) =>
      setConfig((c) => ({ ...c, camera: { ...c.camera, ...partial } })),
    [],
  )
  const patchDetector = useCallback(
    (partial: Partial<DetectorOptions>) =>
      setConfig((c) => ({ ...c, detector: { ...c.detector, ...partial } })),
    [],
  )

  // ---- Unmount cleanup ------------------------------------------------------
  useEffect(() => {
    return () => {
      runningRef.current = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (autoRef.current && connectedRef.current) {
        void sendRef.current(velocityCommand(null)).catch(() => {})
      }
      autoRef.current = false
    }
  }, [])

  return {
    videoRef,
    frameCanvasRef,
    overlayCanvasRef,
    maskCanvasRef,
    config,
    patchController,
    patchDetector,
    patchCamera,
    running,
    autoControl,
    cameraError,
    cameraControlError,
    cameraReportText,
    cameraDevices,
    cameraDeviceId,
    status,
    startCamera,
    stopCamera,
    setAutoControlOn,
    sendOnce,
    calibrate,
    applyCameraConstraints,
    refreshCameraReport,
    setCameraDeviceId,
    disableAutoControl,
  }
}

export type FlameTracker = ReturnType<typeof useFlameTracker>
