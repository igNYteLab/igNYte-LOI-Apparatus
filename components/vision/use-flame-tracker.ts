"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { fw } from "@/lib/firmware"
import {
  DEFAULT_VISION_CONFIG,
  MIN_AUTO_CONTROL_CONFIDENCE,
  type ControllerOptions,
  type DetectorOptions,
  type VisionConfig,
} from "@/lib/vision/config"
import {
  computePIRecommendation,
  computePRecommendation,
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
  video: HTMLVideoElement,
  detection: Detection,
  setpointYPx: number,
) {
  if (!canvas) return
  if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth
  if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

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
      void sendRef.current(velocityCommand(rec))
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

    if (frame.width !== video.videoWidth) frame.width = video.videoWidth
    if (frame.height !== video.videoHeight) frame.height = video.videoHeight
    const fctx = frame.getContext("2d", { willReadFrequently: true })
    if (!fctx) return
    fctx.drawImage(video, 0, 0, frame.width, frame.height)
    const imageData = fctx.getImageData(0, 0, frame.width, frame.height)
    processBusyRef.current = true

    void vision
      .detect(imageData, cfg.detector)
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
            : computePRecommendation(detection, frame.height, cfg.controller)
        if (result.controllerState) controllerStateRef.current = result.controllerState

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

        drawOverlay(overlayCanvasRef.current, video, detection, result.setpointYPx)
        drawMask(maskCanvasRef.current, mask)

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
          width: { ideal: cam.widthPx },
          height: { ideal: cam.heightPx },
          frameRate: { ideal: cam.fps },
        },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play().catch(() => {})
      }
      controllerStateRef.current = resetControllerState()
      runningRef.current = true
      setRunning(true)
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "Failed to start camera")
      runningRef.current = false
      setRunning(false)
    }
  }, [])

  const stopCamera = useCallback(() => {
    runningRef.current = false
    setRunning(false)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
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
    void sendRef.current(velocityCommand(rec)).catch(() => {})
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

  /** Called by the E-STOP: just drop auto control (E-STOP already halts motion). */
  const disableAutoControl = useCallback(() => {
    controllerStateRef.current = resetControllerState()
    autoRef.current = false
    setAutoControl(false)
  }, [])

  // ---- Config patchers ------------------------------------------------------
  const patchController = useCallback(
    (partial: Partial<ControllerOptions>) =>
      setConfig((c) => ({ ...c, controller: { ...c.controller, ...partial } })),
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
    running,
    autoControl,
    cameraError,
    status,
    startCamera,
    stopCamera,
    setAutoControlOn,
    sendOnce,
    calibrate,
    disableAutoControl,
  }
}

export type FlameTracker = ReturnType<typeof useFlameTracker>
