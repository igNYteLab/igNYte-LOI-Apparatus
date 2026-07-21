"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { toast } from "sonner"
import {
  IconActivity,
  IconAdjustments,
  IconBolt,
  IconDatabaseExport,
  IconFlame,
  IconGauge,
  IconHandStop,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconScan,
  IconTargetArrow,
  IconTemperature,
  IconTerminal2,
  IconWind,
} from "@tabler/icons-react"

import { useAuth } from "@/components/auth-provider"
import { useDevice } from "@/components/device-provider"
import {
  CameraCard,
  type CameraController,
} from "@/components/test-monitor/camera-card"
import { VisionPanel } from "@/components/vision/vision-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  fw,
  observedSampleRates,
  SENSOR_NAMES,
  type FirmwareSample,
  type FirmwareStatus,
  type SensorStatusEntry,
} from "@/lib/firmware"
import { recordCompletedTest } from "@/lib/local-db"
import {
  appendTestArchive,
  downloadBlobFile,
  downloadTextFile,
  formatBytes,
  formatElapsed,
  sanitizeArchiveName,
  type TestArchiveEntry,
} from "@/lib/test-monitor"
import { createZipBlob } from "@/lib/zip"

type MonitorGridProps = {
  context?: {
    operator?: string
    sample?: string
    psetId?: string
  }
}

const SAFETY_ITEMS = [
  "Fume hood / extraction running and unobstructed.",
  "O₂ and N₂ cylinders open with nominal pressures.",
  "Gas lines leak-checked since last service.",
  "Specimen mounted vertically and clamped securely.",
  "Chimney seated and free of debris from prior tests.",
  "Ignition source ready; bystanders cleared of the column.",
  "Operator wearing safety glasses and heat-resistant gloves.",
  "Fire extinguisher within arm's reach.",
] as const

const THERMOCOUPLES = ["tc1", "tc2", "tc3", "tc4"] as const
const FLOW_CHANNELS = ["flow1", "flow2"] as const
const DEFAULT_FRAME_EXPORT_FPS = 5
const JPEG_QUALITY = 0.9

type CapturedFrame = {
  frameNumber: number
  filename: string
  elapsedMs: number
  perfMs: number
  blob: Blob
}

type AssociatedFrame = {
  frameNumber: number
  filename: string
  elapsedMs: number
  deltaMs: number
}

type ExportedSample = FirmwareSample & {
  elapsedMs: number | null
  associatedFrame: AssociatedFrame | null
}

const tempChartConfig = {
  tc1: { label: "TC1", color: "var(--chart-1)" },
  tc2: { label: "TC2", color: "var(--chart-2)" },
  tc3: { label: "TC3", color: "var(--chart-3)" },
  tc4: { label: "TC4", color: "var(--chart-4)" },
} satisfies ChartConfig

const flowChartConfig = {
  flow1: { label: "Flow 1 %", color: "var(--chart-1)" },
  flow2: { label: "Flow 2 %", color: "var(--chart-2)" },
} satisfies ChartConfig

const oxygenChartConfig = {
  o2: { label: "O₂ vol %", color: "var(--chart-1)" },
} satisfies ChartConfig

export function TestMonitorDashboard() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <MonitorGrid />
    </div>
  )
}

export function MonitorGrid({ context }: MonitorGridProps) {
  const router = useRouter()
  const { user } = useAuth()
  const {
    supported: serialSupported,
    status: deviceStatus,
    error: deviceError,
    lines,
    samples,
    log,
    getCurrentLog,
    motor,
    boot,
    driver,
    stall,
    sensorStatuses,
    i2c,
    sync,
    connect: connectDevice,
    disconnect: disconnectDevice,
    sendCommand,
  } = useDevice()

  const rgbCameraRef = React.useRef<CameraController | null>(null)
  const hsiCameraRef = React.useRef<CameraController | null>(null)
  const rgbRecorderRef = React.useRef<MediaRecorder | null>(null)
  const hsiRecorderRef = React.useRef<MediaRecorder | null>(null)
  const rgbChunksRef = React.useRef<Blob[]>([])
  const hsiChunksRef = React.useRef<Blob[]>([])
  const pendingRecorderStopsRef = React.useRef(0)
  const capturedFramesRef = React.useRef<CapturedFrame[]>([])
  const frameCaptureTimerRef = React.useRef<number | null>(null)
  const frameCaptureBusyRef = React.useRef(false)
  const frameCounterRef = React.useRef(0)
  const sessionStartPerfMsRef = React.useRef<number | null>(null)
  // Set by the Vision tab so E-STOP can drop auto-control instantly.
  const visionDisableRef = React.useRef<(() => void) | null>(null)

  const [safetyOpen, setSafetyOpen] = React.useState(false)
  const [checkedItems, setCheckedItems] = React.useState<boolean[]>(
    SAFETY_ITEMS.map(() => false)
  )
  const [recording, setRecording] = React.useState(false)
  const [sessionStartMs, setSessionStartMs] = React.useState<number | null>(
    null
  )
  const [sessionStartPerfMs, setSessionStartPerfMs] = React.useState<
    number | null
  >(null)
  const [sessionStartedAt, setSessionStartedAt] = React.useState<string | null>(
    null
  )
  const [sessionStoppedAt, setSessionStoppedAt] = React.useState<string | null>(
    null
  )
  const [sessionSamples, setSessionSamples] = React.useState<FirmwareSample[]>(
    []
  )
  const [capturedFrameCount, setCapturedFrameCount] = React.useState(0)
  const [frameExportFps, setFrameExportFps] = React.useState(
    DEFAULT_FRAME_EXPORT_FPS
  )
  const [rgbVideoBlob, setRgbVideoBlob] = React.useState<Blob | null>(null)
  const [hsiVideoBlob, setHsiVideoBlob] = React.useState<Blob | null>(null)
  const [rgbVideoError, setRgbVideoError] = React.useState<string | null>(null)
  const [hsiVideoError, setHsiVideoError] = React.useState<string | null>(null)
  const [runBaseName, setRunBaseName] = React.useState("")
  const [runTimestampLabel, setRunTimestampLabel] = React.useState("")
  const [saveOpen, setSaveOpen] = React.useState(false)
  const [saveName, setSaveName] = React.useState("")
  const [archiveSaving, setArchiveSaving] = React.useState(false)
  const [clockNow, setClockNow] = React.useState(0)
  const [activeTab, setActiveTab] = React.useState("run")

  const connected = deviceStatus === "connected"
  const operator =
    context?.operator ?? user?.displayName ?? user?.email ?? "Operator"
  const psetId = context?.psetId ?? context?.sample ?? "unassigned-pset"
  const sampleLabel = context?.sample ?? psetId
  const checklistComplete = checkedItems.every(Boolean)
  const connection: "Live" | "Connecting" | "Offline" =
    deviceStatus === "connected"
      ? "Live"
      : deviceStatus === "connecting"
        ? "Connecting"
        : "Offline"

  // Rolling 60-second window of samples for the live charts.
  const windowed = React.useMemo(() => {
    if (!log.length) return []
    const now = log[log.length - 1].receivedAt
    const start = now - 60_000
    return log.filter((s) => s.receivedAt >= start)
  }, [log])

  // Observed per-sensor sample rate (Hz), recomputed as samples arrive.
  const sensorRates = React.useMemo(() => observedSampleRates(log), [log])

  const liveSampleCount =
    recording && sessionStartMs !== null
      ? log.filter((s) => s.receivedAt >= sessionStartMs).length
      : sessionSamples.length

  const sessionDurationSeconds =
    sessionStartedAt && sessionStoppedAt
      ? Math.max(
          0,
          roundMs(
            (new Date(sessionStoppedAt).getTime() -
              new Date(sessionStartedAt).getTime()) /
              1000
          )
        )
      : 0

  React.useEffect(() => {
    if (!recording) return
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [recording])

  async function send(command: string, successMessage?: string) {
    if (!connected) {
      toast.error("Connect the board before sending commands.")
      return
    }
    try {
      await sendCommand(command)
      if (successMessage) toast.success(successMessage)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Command failed.")
    }
  }

  async function resetBoardConnection() {
    if (recording) {
      toast.error("Stop the active test before resetting the board link.")
      return
    }
    try {
      await disconnectDevice()
      toast.success("Board connection reset")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Board connection reset failed."
      )
    }
  }

  // Mainsail-style emergency stop: kill motion and cut both gas flows.
  // Each command is attempted in order even if an earlier one fails, so a single
  // write error can never leave the motor enabled or gas still flowing.
  async function emergencyStop() {
    if (!connected) {
      toast.error("Connect the board first.")
      return
    }
    // Drop vision auto-control first so it can't keep commanding velocity.
    visionDisableRef.current?.()
    const commands = [
      fw.motorStop(),
      fw.motorDisable(),
      fw.flowSet(1, 0),
      fw.flowSet(2, 0),
    ]
    let failures = 0
    for (const command of commands) {
      try {
        await sendCommand(command)
      } catch {
        failures += 1
      }
    }
    if (failures) {
      toast.error(
        `E-STOP: ${failures} of ${commands.length} commands failed — verify the rig is safe.`
      )
    } else {
      toast.success("E-STOP — motor disabled, gas flows cut to 0%")
    }
  }

  async function beginRecording() {
    if (!checklistComplete) return
    if (!connected) {
      toast.error("Connect the board before starting a test.")
      return
    }
    setSafetyOpen(false)
    // eslint-disable-next-line react-hooks/purity -- Event-handler timestamp for the run start.
    const startMs = Date.now()
    // eslint-disable-next-line react-hooks/purity -- Event-handler timestamp for the run start.
    const startPerfMs = performance.now()
    const timestampLabel = formatLocalTimestamp(new Date(startMs))
    const nextRunBaseName = runArchiveBaseName(timestampLabel, psetId)
    rgbChunksRef.current = []
    hsiChunksRef.current = []
    capturedFramesRef.current = []
    frameCounterRef.current = 0
    pendingRecorderStopsRef.current = 0
    sessionStartPerfMsRef.current = startPerfMs
    setSessionStartMs(startMs)
    setSessionStartPerfMs(startPerfMs)
    setSessionStartedAt(new Date(startMs).toISOString())
    setSessionStoppedAt(null)
    setSessionSamples([])
    setCapturedFrameCount(0)
    setRgbVideoBlob(null)
    setHsiVideoBlob(null)
    setRgbVideoError(null)
    setHsiVideoError(null)
    setRunBaseName(nextRunBaseName)
    setRunTimestampLabel(timestampLabel)
    setClockNow(startMs)
    setRecording(true)

    try {
      if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder is not available in this browser.")
      }
      const rgbStream = await rgbCameraRef.current?.getRecordingStream()
      if (!rgbStream) throw new Error("RGB camera stream is unavailable.")
      const hsiStream = await hsiCameraRef.current?.getRecordingStream()
      if (!hsiStream) {
        throw new Error("Hyperspectral camera stream is unavailable.")
      }

      const rgbRecorder = createSessionRecorder(
        "rgb",
        rgbStream,
        rgbChunksRef,
        setRgbVideoBlob,
        setRgbVideoError
      )
      const hsiRecorder = createSessionRecorder(
        "hsi",
        hsiStream,
        hsiChunksRef,
        setHsiVideoBlob,
        setHsiVideoError
      )
      rgbRecorderRef.current = rgbRecorder
      hsiRecorderRef.current = hsiRecorder
      pendingRecorderStopsRef.current = 2
      startLiveFrameFallback(timestampLabel, startPerfMs)
      rgbRecorder.start(1000)
      hsiRecorder.start(1000)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Video capture failed."
      setRgbVideoError(message)
      setHsiVideoError(message)
      stopLiveFrameFallback()
      rgbCameraRef.current?.stopRecordingCapture()
      hsiCameraRef.current?.stopRecordingCapture()
      setRecording(false)
      toast.error(message)
      rgbRecorderRef.current = null
      hsiRecorderRef.current = null
      pendingRecorderStopsRef.current = 0
    }
  }

  function createSessionRecorder(
    cameraRole: "rgb" | "hsi",
    stream: MediaStream,
    chunksRef: React.MutableRefObject<Blob[]>,
    setBlob: React.Dispatch<React.SetStateAction<Blob | null>>,
    setError: React.Dispatch<React.SetStateAction<string | null>>
  ) {
    const mimeType = preferredRecorderMimeType()
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined
    )
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onerror = () => {
      setError(`${cameraRole.toUpperCase()} video recorder failed.`)
    }
    recorder.onstop = () => {
      const blob = chunksRef.current.length
        ? new Blob(chunksRef.current, {
            type: recorder.mimeType || "video/webm",
          })
        : null
      setBlob(blob)
      finalizeRecorderStop()
    }
    return recorder
  }

  function finalizeRecorderStop() {
    pendingRecorderStopsRef.current = Math.max(
      0,
      pendingRecorderStopsRef.current - 1
    )
    if (pendingRecorderStopsRef.current === 0) {
      rgbCameraRef.current?.stopRecordingCapture()
      hsiCameraRef.current?.stopRecordingCapture()
      setSaveOpen(true)
    }
  }

  function stopRecorderIfActive(recorder: MediaRecorder | null) {
    if (recorder && recorder.state !== "inactive") {
      recorder.stop()
      return true
    }
    return false
  }

  function stopSessionRecorders() {
    const activeRecorders = [
      rgbRecorderRef.current,
      hsiRecorderRef.current,
    ].filter((recorder) => recorder && recorder.state !== "inactive")

    pendingRecorderStopsRef.current = activeRecorders.length
    if (!activeRecorders.length) {
      rgbCameraRef.current?.stopRecordingCapture()
      hsiCameraRef.current?.stopRecordingCapture()
      setSaveOpen(true)
      return
    }

    activeRecorders.forEach((recorder) => stopRecorderIfActive(recorder))
  }

  function stopRecording() {
    // eslint-disable-next-line react-hooks/purity -- Event-handler timestamp for the run stop.
    const stopMs = Date.now()
    stopLiveFrameFallback()
    setSessionStoppedAt(new Date(stopMs).toISOString())
    setSaveName(
      runBaseName ||
        runArchiveBaseName(formatLocalTimestamp(new Date(stopMs)), psetId)
    )
    setClockNow(stopMs)
    setRecording(false)
    // Capture every sample received during the session window.
    const start = sessionStartMs ?? stopMs
    const currentLog = getCurrentLog()
    setSessionSamples(
      currentLog.filter((s) => s.receivedAt >= start && s.receivedAt <= stopMs)
    )
    stopSessionRecorders()
  }

  function clearSession() {
    stopLiveFrameFallback()
    rgbRecorderRef.current = null
    hsiRecorderRef.current = null
    rgbChunksRef.current = []
    hsiChunksRef.current = []
    capturedFramesRef.current = []
    frameCounterRef.current = 0
    pendingRecorderStopsRef.current = 0
    sessionStartPerfMsRef.current = null
    setRecording(false)
    setSessionStartMs(null)
    setSessionStartPerfMs(null)
    setSessionStartedAt(null)
    setSessionStoppedAt(null)
    setSessionSamples([])
    setCapturedFrameCount(0)
    setRgbVideoBlob(null)
    setHsiVideoBlob(null)
    setRgbVideoError(null)
    setHsiVideoError(null)
    setRunBaseName("")
    setRunTimestampLabel("")
    setSaveOpen(false)
  }

  function stopLiveFrameFallback() {
    if (frameCaptureTimerRef.current !== null) {
      window.clearInterval(frameCaptureTimerRef.current)
      frameCaptureTimerRef.current = null
    }
    frameCaptureBusyRef.current = false
  }

  function startLiveFrameFallback(timestampLabel: string, startPerfMs: number) {
    stopLiveFrameFallback()
    const safeFps = clampFrameExportFps(frameExportFps)
    const intervalMs = Math.max(1, Math.round(1000 / safeFps))
    const capture = async () => {
      if (frameCaptureBusyRef.current) return
      frameCaptureBusyRef.current = true
      try {
        const blob = await hsiCameraRef.current?.captureFrameJpeg(JPEG_QUALITY)
        if (!blob) return
        const frameNumber = frameCounterRef.current + 1
        frameCounterRef.current = frameNumber
        const elapsedMs = roundMs(performance.now() - startPerfMs)
        const frame: CapturedFrame = {
          frameNumber,
          filename: `${timestampLabel}-Frame${String(frameNumber).padStart(
            6,
            "0"
          )}.jpg`,
          elapsedMs,
          perfMs: roundMs(startPerfMs + elapsedMs),
          blob,
        }
        capturedFramesRef.current = [...capturedFramesRef.current, frame]
        setCapturedFrameCount(capturedFramesRef.current.length)
      } catch {
        // HSI fallback capture is best effort; HSI WebM extraction remains primary.
      } finally {
        frameCaptureBusyRef.current = false
      }
    }

    void capture()
    frameCaptureTimerRef.current = window.setInterval(
      () => void capture(),
      intervalMs
    )
  }

  async function saveArchive() {
    if (!sessionStartedAt || !sessionStoppedAt) return
    setArchiveSaving(true)
    const safeName = sanitizeArchiveName(saveName)
    const rgbVideoFile = rgbVideoBlob ? `${safeName}-rgb.webm` : null
    const hsiVideoFile = hsiVideoBlob ? `${safeName}-hsi.webm` : null
    const videoFile = hsiVideoFile ?? rgbVideoFile
    const videoError = [rgbVideoError, hsiVideoError]
      .filter(Boolean)
      .join(" | ")
    let frames: CapturedFrame[]
    const fallbackFrames = capturedFramesRef.current
    const fallbackDurationSeconds = Math.max(
      0,
      (new Date(sessionStoppedAt).getTime() -
        new Date(sessionStartedAt).getTime()) /
        1000
    )
    try {
      frames = hsiVideoBlob
        ? await extractJpegFramesFromVideo(
            hsiVideoBlob,
            runTimestampLabel ||
              formatLocalTimestamp(new Date(sessionStartedAt)),
            clampFrameExportFps(frameExportFps),
            sessionStartPerfMs,
            fallbackDurationSeconds
          )
        : fallbackFrames
    } catch (err) {
      if (!fallbackFrames.length) {
        toast.error(err instanceof Error ? err.message : "Frame export failed.")
        setArchiveSaving(false)
        return
      }
      toast.warning(
        "HSI video frame extraction failed; using live HSI captured frames."
      )
      frames = fallbackFrames
    }
    if (!frames.length && fallbackFrames.length) {
      frames = fallbackFrames
    }
    if (!frames.length && hsiVideoBlob) {
      toast.error("No HSI frames could be exported from this recording.")
      setArchiveSaving(false)
      return
    }
    capturedFramesRef.current = frames
    setCapturedFrameCount(frames.length)
    const exportedSamples = buildExportedSamples(
      sessionSamples,
      frames,
      sessionStartPerfMs,
      sessionStartMs
    )
    const frameFiles = frames.map((frame) => ({
      frameNumber: frame.frameNumber,
      filename: frame.filename,
      path: `frames/${frame.filename}`,
      elapsedMs: frame.elapsedMs,
      perfMs: frame.perfMs,
    }))
    const meta = {
      name: saveName.trim() || safeName,
      runId: safeName,
      psetId,
      startedAt: sessionStartedAt,
      startedAtLocal: formatLocalDateTime(new Date(sessionStartedAt)),
      stoppedAt: sessionStoppedAt,
      stoppedAtLocal: formatLocalDateTime(new Date(sessionStoppedAt)),
      durationSeconds: sessionDurationSeconds,
      sampleCount: sessionSamples.length,
      frameExportFps: clampFrameExportFps(frameExportFps),
      frameCount: frames.length,
      operator,
      sample: sampleLabel,
      videoFile,
      videoError: videoError || null,
      rgbVideoFile,
      hsiVideoFile,
      rgbVideoError,
      hsiVideoError,
      frameSource: "hsi" as const,
      frameSourceVideoFile: hsiVideoFile,
      framesDirectory: "frames",
    }
    const entry: TestArchiveEntry = {
      id: createArchiveId(),
      meta,
      samples: exportedSamples,
    }

    const jsonContent = JSON.stringify(
      { meta, frames: frameFiles, samples: exportedSamples },
      null,
      2
    )
    const zipEntries = [
      { path: `${safeName}.json`, data: jsonContent },
      ...(rgbVideoBlob && rgbVideoFile
        ? [{ path: rgbVideoFile, data: rgbVideoBlob }]
        : []),
      ...(hsiVideoBlob && hsiVideoFile
        ? [{ path: hsiVideoFile, data: hsiVideoBlob }]
        : []),
      ...frames.map((frame) => ({
        path: `frames/${frame.filename}`,
        data: frame.blob,
      })),
    ]
    try {
      downloadBlobFile(`${safeName}.zip`, await createZipBlob(zipEntries))
      appendTestArchive(entry)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Archive save failed.")
      setArchiveSaving(false)
      return
    }
    // Mirror the save into the local DB (db/schema.sql shape) — best effort,
    // never blocks the archive flow.
    try {
      recordCompletedTest({
        sample: { externalId: sampleLabel },
        run: {
          externalTestId: safeName,
          psetId,
          startedAt: sessionStartedAt,
          stoppedAt: sessionStoppedAt,
          durationSeconds: sessionDurationSeconds,
        },
        samples: sessionSamples,
      })
    } catch {
      // Local DB is non-critical; ignore failures.
    }
    toast.success("Test archive saved locally")
    setArchiveSaving(false)
    clearSession()
  }

  function downloadCurrentData() {
    const currentLog = getCurrentLog()
    if (!currentLog.length) {
      toast.error("No samples have been received yet.")
      return
    }
    const filename = `samples_${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    downloadTextFile(filename, JSON.stringify(currentLog, null, 2))
  }

  return (
    <>
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-base font-medium">Test Monitor</h1>
            <ConnectionBadge state={connection} />
            {boot ? (
              <Badge variant={boot.ready ? "secondary" : "outline"}>
                boot: {boot.status}
              </Badge>
            ) : null}
            {connected ? (
              <Badge
                variant={sync.calibrated ? "secondary" : "outline"}
                title={
                  sync.offsetMs !== null
                    ? `Clock offset ${sync.offsetMs.toFixed(0)} ms — sample times = t_us/1000 + offset in the laptop performance.now() timeline`
                    : "Calibrating host↔board clock offset…"
                }
              >
                {sync.calibrated ? "clock synced" : "clock: syncing…"}
              </Badge>
            ) : null}
            {recording ? (
              <Badge variant="destructive" className="animate-pulse">
                REC · {liveSampleCount}
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <TabsList>
              <TabsTrigger value="run">
                <IconFlame data-icon="inline-start" />
                Run
              </TabsTrigger>
              <TabsTrigger value="monitoring">
                <IconGauge data-icon="inline-start" />
                Monitoring
              </TabsTrigger>
              <TabsTrigger value="config">
                <IconAdjustments data-icon="inline-start" />
                Config
              </TabsTrigger>
              <TabsTrigger value="vision">
                <IconTargetArrow data-icon="inline-start" />
                Vision
              </TabsTrigger>
            </TabsList>
            {!connected ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!serialSupported || deviceStatus === "connecting"}
                title={
                  serialSupported
                    ? (deviceError ?? undefined)
                    : "Web Serial isn't available. Use Chrome or Edge over localhost/HTTPS."
                }
                onClick={() => void connectDevice()}
              >
                <IconBolt data-icon="inline-start" />
                {deviceStatus === "connecting"
                  ? "Connecting…"
                  : serialSupported
                    ? "Connect board"
                    : "Serial unavailable"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                !serialSupported || deviceStatus === "connecting" || recording
              }
              title={
                recording
                  ? "Stop the active test before resetting the board link."
                  : "Close the serial port and clear board telemetry without reloading the page."
              }
              onClick={() => void resetBoardConnection()}
            >
              <IconRefresh data-icon="inline-start" />
              Reset link
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!connected}
              className="font-semibold"
              onClick={() => void emergencyStop()}
            >
              <IconHandStop data-icon="inline-start" />
              E-STOP
            </Button>
          </div>
        </div>

        {deviceError && connected ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {deviceError}
          </p>
        ) : null}

        <TabsContent value="run" className="min-h-0 overflow-auto">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="grid min-h-0 gap-3">
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <IconFlame />
                    Test Run
                  </CardTitle>
                  <CardDescription>
                    Operator controls for the active flame test.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricPill label="Connection" value={connection} />
                  <MetricPill
                    label="Clock"
                    value={
                      connected
                        ? sync.calibrated
                          ? "synced"
                          : "syncing"
                        : "offline"
                    }
                  />
                  <MetricPill label="Samples" value={liveSampleCount} />
                  <MetricPill label="HSI frames" value={capturedFrameCount} />
                  <MetricPill
                    label="Elapsed"
                    value={
                      recording && sessionStartMs !== null
                        ? formatElapsed((clockNow - sessionStartMs) / 1000)
                        : formatElapsed(sessionDurationSeconds)
                    }
                  />
                </CardContent>
                <CardFooter className="flex flex-wrap items-end gap-2">
                  <div className="grid w-32 gap-1">
                    <Label htmlFor="frame-export-fps" className="text-xs">
                      Frame export FPS
                    </Label>
                    <Input
                      id="frame-export-fps"
                      type="number"
                      min={1}
                      max={30}
                      step={1}
                      value={frameExportFps}
                      disabled={recording}
                      onChange={(event) =>
                        setFrameExportFps(
                          clampFrameExportFps(Number(event.target.value))
                        )
                      }
                    />
                  </div>
                  {!connected ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        !serialSupported || deviceStatus === "connecting"
                      }
                      title={
                        serialSupported
                          ? (deviceError ?? undefined)
                          : "Web Serial isn't available. Use Chrome or Edge over localhost/HTTPS."
                      }
                      onClick={() => void connectDevice()}
                    >
                      <IconBolt data-icon="inline-start" />
                      {deviceStatus === "connecting"
                        ? "Connecting..."
                        : serialSupported
                          ? "Connect board"
                          : "Serial unavailable"}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!connected}
                    onClick={() =>
                      void send(
                        fw.motorCalibrateAxis(),
                        "Axis calibration started"
                      )
                    }
                  >
                    <IconAdjustments data-icon="inline-start" />
                    Calibrate axis
                  </Button>
                  {recording ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={stopRecording}
                    >
                      <IconPlayerStop data-icon="inline-start" />
                      Stop test
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={!connected}
                      onClick={() => {
                        setCheckedItems(SAFETY_ITEMS.map(() => false))
                        setSafetyOpen(true)
                      }}
                    >
                      <IconPlayerPlay data-icon="inline-start" />
                      Run test
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={!connected}
                    className="font-semibold"
                    onClick={() => void emergencyStop()}
                  >
                    <IconHandStop data-icon="inline-start" />
                    E-STOP
                  </Button>
                </CardFooter>
              </Card>

              <VisionPanel
                connected={connected}
                sendCommand={sendCommand}
                disableRef={visionDisableRef}
              />

              <Card size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <IconTemperature />
                    Live Trends
                  </CardTitle>
                  <CardDescription>Rolling 60-second window.</CardDescription>
                </CardHeader>
                <CardContent className="grid min-h-80 gap-3 xl:grid-cols-3">
                  <TrendChart
                    title="Thermocouples (°C)"
                    data={buildSeries(windowed, THERMOCOUPLES, (s) => s.temp_c)}
                    config={tempChartConfig}
                    seriesKeys={[...THERMOCOUPLES]}
                  />
                  <TrendChart
                    title="Flow controllers (%)"
                    data={buildSeries(windowed, FLOW_CHANNELS, (s) => s.pct)}
                    config={flowChartConfig}
                    seriesKeys={[...FLOW_CHANNELS]}
                  />
                  <TrendChart
                    title="Oxygen (vol %)"
                    data={buildSeries(windowed, ["o2"], (s) => s.o2_vol_pct)}
                    config={oxygenChartConfig}
                    seriesKeys={["o2"]}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="grid min-h-0 gap-3">
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {activeTab === "run" ? (
                  <>
                    <CameraCard
                      ref={rgbCameraRef}
                      title="RGB Sample Camera"
                      description="Recordable sample-chamber view."
                      storageKey="ignyte.camera.source"
                      streamUrl={process.env.NEXT_PUBLIC_CAMERA_URL}
                      recordable
                      recording={recording}
                      variant="rgb"
                    />
                    <CameraCard
                      ref={hsiCameraRef}
                      title="Hyperspectral Camera"
                      description="Recordable HSI preview; exported frames come from this stream."
                      storageKey="ignyte.camera.hsi.source"
                      streamUrl={process.env.NEXT_PUBLIC_HSI_CAMERA_URL}
                      recordable
                      recording={recording}
                      variant="hsi"
                    />
                  </>
                ) : null}
              </div>

              <Card size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <IconGauge />
                    Live Sensors
                  </CardTitle>
                  <CardDescription>
                    Latest reading and sample rate.
                  </CardDescription>
                </CardHeader>
                <CardContent className="max-h-96 overflow-auto">
                  <SensorReadouts
                    samples={samples}
                    rates={sensorRates}
                    connected={connected}
                  />
                </CardContent>
              </Card>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <MotorControlCard
                  motor={motor}
                  connected={connected}
                  onSend={send}
                />
                <FlowControlCard
                  samples={samples}
                  connected={connected}
                  onSend={send}
                />
                <SensorRateCard connected={connected} onSend={send} />
                <StallGuardCard
                  driver={driver}
                  stall={stall}
                  connected={connected}
                  onSend={send}
                />
                <BusSensorCard
                  i2c={i2c}
                  sensorStatuses={sensorStatuses}
                  connected={connected}
                  onSend={send}
                />
                <ConsoleCard
                  lines={lines}
                  connected={connected}
                  onSend={(command) => void send(command)}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="monitoring" className="min-h-0">
          <div className="grid min-h-0 gap-3 lg:h-[calc(100svh-var(--header-height)-8rem)] lg:grid-cols-12 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* Live sensor readouts */}
            <Card className="min-h-0 lg:col-span-3" size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <IconGauge />
                  Live Sensors
                </CardTitle>
                <CardDescription>Latest per sensor.</CardDescription>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-auto">
                <SensorReadouts
                  samples={samples}
                  rates={sensorRates}
                  connected={connected}
                />
              </CardContent>
            </Card>

            {/* Cameras */}
            <div className="min-h-0 lg:col-span-5">
              {activeTab === "monitoring" ? (
                <CameraCard
                  ref={rgbCameraRef}
                  title="RGB Sample Camera"
                  description="Recordable sample-chamber view."
                  storageKey="ignyte.camera.source"
                  streamUrl={process.env.NEXT_PUBLIC_CAMERA_URL}
                  recordable
                  recording={recording}
                  variant="rgb"
                />
              ) : null}
            </div>
            <div className="min-h-0 lg:col-span-4">
              {activeTab === "monitoring" ? (
                <CameraCard
                  ref={hsiCameraRef}
                  title="Hyperspectral Camera"
                  description="Recordable HSI preview; exported frames come from this stream."
                  storageKey="ignyte.camera.hsi.source"
                  streamUrl={process.env.NEXT_PUBLIC_HSI_CAMERA_URL}
                  recordable
                  recording={recording}
                  variant="hsi"
                />
              ) : null}
            </div>

            {/* Trends */}
            <Card className="min-h-0 lg:col-span-8" size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <IconTemperature />
                  Real-Time Trends
                </CardTitle>
                <CardDescription>Rolling 60-second window.</CardDescription>
              </CardHeader>
              <CardContent className="grid min-h-0 flex-1 gap-3 xl:grid-cols-3">
                <TrendChart
                  title="Thermocouples (°C)"
                  data={buildSeries(windowed, THERMOCOUPLES, (s) => s.temp_c)}
                  config={tempChartConfig}
                  seriesKeys={[...THERMOCOUPLES]}
                />
                <TrendChart
                  title="Flow controllers (%)"
                  data={buildSeries(windowed, FLOW_CHANNELS, (s) => s.pct)}
                  config={flowChartConfig}
                  seriesKeys={[...FLOW_CHANNELS]}
                />
                <TrendChart
                  title="Oxygen (vol %)"
                  data={buildSeries(windowed, ["o2"], (s) => s.o2_vol_pct)}
                  config={oxygenChartConfig}
                  seriesKeys={["o2"]}
                />
              </CardContent>
            </Card>

            {/* Recording / session */}
            <Card className="min-h-0 lg:col-span-4" size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <IconFlame />
                  Session Recording
                </CardTitle>
                <CardDescription>
                  Safety-gated capture of samples + RGB video.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <MetricPill label="Session samples" value={liveSampleCount} />
                  <MetricPill label="HSI frames" value={capturedFrameCount} />
                  <MetricPill label="Buffer" value={`${log.length} samples`} />
                  <MetricPill
                    label="Started"
                    value={
                      sessionStartedAt
                        ? formatLocalClock(new Date(sessionStartedAt))
                        : "—"
                    }
                  />
                  <MetricPill
                    label="Duration"
                    value={
                      recording && sessionStartMs !== null
                        ? formatElapsed((clockNow - sessionStartMs) / 1000)
                        : formatElapsed(sessionDurationSeconds)
                    }
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-wrap items-end gap-2">
                <div className="grid w-32 gap-1">
                  <Label htmlFor="session-frame-export-fps" className="text-xs">
                    Frame export FPS
                  </Label>
                  <Input
                    id="session-frame-export-fps"
                    type="number"
                    min={1}
                    max={30}
                    step={1}
                    value={frameExportFps}
                    disabled={recording}
                    onChange={(event) =>
                      setFrameExportFps(
                        clampFrameExportFps(Number(event.target.value))
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={downloadCurrentData}
                >
                  <IconDatabaseExport data-icon="inline-start" />
                  Export buffer
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={recording}
                  onClick={() => router.push("/dashboard")}
                >
                  New PSET
                </Button>
                {recording ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={stopRecording}
                  >
                    <IconPlayerStop data-icon="inline-start" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!connected}
                    onClick={() => {
                      setCheckedItems(SAFETY_ITEMS.map(() => false))
                      setSafetyOpen(true)
                    }}
                  >
                    <IconPlayerPlay data-icon="inline-start" />
                    Start
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="config" className="min-h-0 overflow-auto">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <MotorControlCard
              motor={motor}
              connected={connected}
              onSend={send}
            />
            <FlowControlCard
              samples={samples}
              connected={connected}
              onSend={send}
            />
            <SensorRateCard connected={connected} onSend={send} />
            <StallGuardCard
              driver={driver}
              stall={stall}
              connected={connected}
              onSend={send}
            />
            <BusSensorCard
              i2c={i2c}
              sensorStatuses={sensorStatuses}
              connected={connected}
              onSend={send}
            />
            <ConsoleCard
              lines={lines}
              connected={connected}
              onSend={(command) => void send(command)}
            />
          </div>
        </TabsContent>

        <TabsContent value="vision" className="min-h-0 overflow-auto">
          <VisionPanel
            connected={connected}
            sendCommand={sendCommand}
            disableRef={visionDisableRef}
          />
        </TabsContent>
      </Tabs>

      <SafetyChecklistDialog
        open={safetyOpen}
        checkedItems={checkedItems}
        onCheckedItemsChange={setCheckedItems}
        onOpenChange={setSafetyOpen}
        onBegin={() => void beginRecording()}
      />

      <SaveTestDialog
        open={saveOpen}
        saveName={saveName}
        onSaveNameChange={setSaveName}
        sampleCount={sessionSamples.length}
        frameCount={capturedFrameCount}
        durationSeconds={sessionDurationSeconds}
        rgbVideoBlob={rgbVideoBlob}
        hsiVideoBlob={hsiVideoBlob}
        rgbVideoError={rgbVideoError}
        hsiVideoError={hsiVideoError}
        saving={archiveSaving}
        onSave={saveArchive}
        onDiscard={clearSession}
      />
    </>
  )
}

function ConnectionBadge({
  state,
}: {
  state: "Live" | "Connecting" | "Offline"
}) {
  return (
    <Badge
      variant={
        state === "Live"
          ? "default"
          : state === "Offline"
            ? "destructive"
            : "secondary"
      }
    >
      {state}
    </Badge>
  )
}

function MetricPill({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="rounded-md border p-2">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-medium tabular-nums">{value}</div>
    </div>
  )
}

function fmt(value: number | undefined, digits = 2) {
  return typeof value === "number" ? value.toFixed(digits) : "—"
}

function SensorReadouts({
  samples,
  rates,
  connected,
}: {
  samples: Record<string, FirmwareSample>
  rates: Record<string, number>
  connected: boolean
}) {
  const present = Object.values(samples).sort((a, b) =>
    a.sensor.localeCompare(b.sensor)
  )

  if (!present.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {connected ? "Waiting for samples…" : "Connect the board to view data."}
      </p>
    )
  }

  return (
    <dl className="grid grid-cols-2 gap-2">
      {present.map((s) => (
        <div key={s.sensor} className="rounded-md border p-2">
          <dt className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate font-medium">{s.sensor}</span>
            {s.ok === false || s.valid === false ? (
              <span className="text-destructive">fault</span>
            ) : null}
          </dt>
          <dd className="flex items-baseline justify-between gap-2 font-mono text-sm tabular-nums">
            <span>{describeSample(s)}</span>
            {rates[s.sensor] !== undefined ? (
              <span className="text-[10px] text-muted-foreground">
                {rates[s.sensor].toFixed(1)} Hz
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function describeSample(s: FirmwareSample) {
  switch (s.kind) {
    case "oxygen":
      return `${fmt(s.o2_vol_pct, 2)} % O₂`
    case "thermocouple":
      return `${fmt(s.temp_c, 1)} °C`
    case "flow_controller":
      return `${fmt(s.pct, 1)} %`
    case "analog":
      return `${fmt(s.velocity_m_s, 3)} m/s`
    case "environment":
      return s.pressure_hpa !== undefined
        ? `${fmt(s.temp_c, 1)} °C · ${fmt(s.rh_pct, 0)} %RH · ${fmt(s.pressure_hpa, 0)} hPa`
        : `${fmt(s.temp_c, 1)} °C · ${fmt(s.rh_pct, 0)} %RH`
    default:
      return "—"
  }
}

function buildSeries(
  windowed: FirmwareSample[],
  sensors: readonly string[],
  valueOf: (s: FirmwareSample) => number | undefined
) {
  const origin = windowed[0]?.receivedAt ?? 0
  const rows: Array<Record<string, number>> = []
  for (const s of windowed) {
    if (!sensors.includes(s.sensor)) continue
    const value = valueOf(s)
    if (typeof value !== "number") continue
    rows.push({
      elapsedSeconds: Math.max(0, (s.receivedAt - origin) / 1000),
      [s.sensor]: value,
    })
  }
  return rows
}

function TrendChart({
  title,
  data,
  config,
  seriesKeys,
}: {
  title: string
  data: Array<Record<string, number>>
  config: ChartConfig
  seriesKeys: string[]
}) {
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="text-xs font-medium">{title}</div>
      <ChartContainer
        config={config}
        className="aspect-auto min-h-[150px]"
        initialDimension={{ width: 320, height: 160 }}
      >
        <LineChart
          data={data}
          margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="elapsedSeconds"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={28}
            tickFormatter={(value) => formatElapsed(Number(value))}
          />
          <YAxis
            width={34}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => Number(value).toFixed(0)}
          />
          <ChartTooltip
            animationDuration={0}
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatElapsed(Number(value))}
                formatter={(value, name) => (
                  <>
                    <span className="text-muted-foreground">
                      {config[String(name)]?.label ?? String(name)}
                    </span>
                    <span className="font-mono font-medium text-foreground tabular-nums">
                      {typeof value === "number"
                        ? value.toFixed(2)
                        : String(value)}
                    </span>
                  </>
                )}
              />
            }
          />
          {seriesKeys.map((key) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={`var(--color-${key})`}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  )
}

function MotorControlCard({
  motor,
  connected,
  onSend,
}: {
  motor: {
    enabled: boolean
    position_mm: number
    position_steps: number
    endstop_active: boolean
    velocity_mode: boolean
  } | null
  connected: boolean
  onSend: (command: string, successMessage?: string) => void
}) {
  const [targetMm, setTargetMm] = React.useState("")
  const [steps, setSteps] = React.useState("")
  const [velocity, setVelocity] = React.useState("")

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <IconBolt />
          Motor
        </CardTitle>
        <CardDescription>
          Driver is disabled after boot — enable before motion.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <MetricPill
            label="Enabled"
            value={motor ? (motor.enabled ? "yes" : "no") : "—"}
          />
          <MetricPill
            label="Position"
            value={motor ? `${motor.position_mm.toFixed(2)} mm` : "—"}
          />
          <MetricPill
            label="Steps"
            value={motor ? motor.position_steps : "—"}
          />
          <MetricPill
            label="Endstop"
            value={motor ? (motor.endstop_active ? "active" : "clear") : "—"}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!connected}
            onClick={() => onSend(fw.motorEnable(), "Motor enable sent")}
          >
            Enable
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!connected}
            onClick={() => onSend(fw.motorDisable(), "Motor disable sent")}
          >
            Disable
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!connected}
            onClick={() => onSend(fw.motorStop(), "Stop sent")}
          >
            Stop
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!connected}
            onClick={() =>
              onSend(fw.motorCalibrateAxis(), "Axis calibration started")
            }
          >
            Calibrate axis
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!connected}
            onClick={() => onSend(fw.motorHomeHere(), "Home-here sent")}
          >
            Home here
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!connected}
            onClick={() => onSend(fw.motorStatus())}
            aria-label="Refresh motor status"
          >
            <IconRefresh />
          </Button>
        </div>
        <Separator />
        {/* Klipper-style relative jog from the current absolute position. */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            Jog (mm) · from {motor ? motor.position_mm.toFixed(2) : "—"}
          </span>
          <div className="flex flex-wrap gap-1">
            {[-10, -1, -0.1, 0.1, 1, 10].map((delta) => {
              const target = (motor?.position_mm ?? 0) + delta
              return (
                <Button
                  key={delta}
                  size="sm"
                  variant="outline"
                  disabled={!connected}
                  onClick={() =>
                    onSend(
                      fw.motorTargetMm(target),
                      `Move to ${Math.max(0, target).toFixed(2)} mm`
                    )
                  }
                >
                  {delta > 0 ? `+${delta}` : delta}
                </Button>
              )
            })}
          </div>
        </div>
        <Separator />
        <NumberCommand
          label="Target (mm)"
          value={targetMm}
          onChange={setTargetMm}
          disabled={!connected}
          onSend={(n) => onSend(fw.motorTargetMm(n), `Target ${n} mm sent`)}
        />
        <NumberCommand
          label="Move (steps)"
          value={steps}
          onChange={setSteps}
          disabled={!connected}
          onSend={(n) =>
            onSend(fw.motorMoveSteps(n), `Move ${Math.round(n)} steps sent`)
          }
        />
        <NumberCommand
          label="Velocity (mm/s)"
          value={velocity}
          onChange={setVelocity}
          disabled={!connected}
          onSend={(n) => onSend(fw.motorVelocity(n), `Velocity ${n} mm/s sent`)}
        />
      </CardContent>
    </Card>
  )
}

function FlowControlCard({
  samples,
  connected,
  onSend,
}: {
  samples: Record<string, FirmwareSample>
  connected: boolean
  onSend: (command: string, successMessage?: string) => void
}) {
  const [channel, setChannel] = React.useState("1")
  const [pct, setPct] = React.useState("")

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <IconWind />
          Flow controllers
        </CardTitle>
        <CardDescription>Bronkhorst setpoint, % of full scale.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <MetricPill
            label="Flow 1"
            value={`${fmt(samples.flow1?.pct, 1)} %`}
          />
          <MetricPill
            label="Flow 2"
            value={`${fmt(samples.flow2?.pct, 1)} %`}
          />
        </div>
        <Field>
          <FieldLabel>Channel</FieldLabel>
          <Select
            value={channel}
            onValueChange={setChannel}
            disabled={!connected}
          >
            <SelectTrigger className="w-full" aria-label="Flow channel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="1">Channel 1</SelectItem>
                <SelectItem value="2">Channel 2</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <NumberCommand
          label="Setpoint (%)"
          value={pct}
          onChange={setPct}
          disabled={!connected}
          onSend={(n) =>
            onSend(fw.flowSet(Number(channel), n), `Flow ${channel} → ${n}%`)
          }
        />
      </CardContent>
    </Card>
  )
}

function SensorRateCard({
  connected,
  onSend,
}: {
  connected: boolean
  onSend: (command: string, successMessage?: string) => void
}) {
  const [sensor, setSensor] = React.useState<string>(SENSOR_NAMES[0])
  const [hz, setHz] = React.useState("")

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <IconGauge />
          Sensor polling
        </CardTitle>
        <CardDescription>
          Set a sensor&apos;s rate (0 disables).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field>
          <FieldLabel>Sensor</FieldLabel>
          <Select
            value={sensor}
            onValueChange={setSensor}
            disabled={!connected}
          >
            <SelectTrigger className="w-full" aria-label="Sensor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {SENSOR_NAMES.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <NumberCommand
          label="Rate (Hz)"
          value={hz}
          onChange={setHz}
          disabled={!connected}
          onSend={(n) =>
            onSend(fw.sensorRate(sensor, n), `${sensor} → ${Math.round(n)} Hz`)
          }
        />
      </CardContent>
    </Card>
  )
}

function isNum(value: string) {
  return value.trim() !== "" && Number.isFinite(Number(value))
}

function StallGuardCard({
  driver,
  stall,
  connected,
  onSend,
}: {
  driver: FirmwareStatus | null
  stall: FirmwareStatus | null
  connected: boolean
  onSend: (command: string, successMessage?: string) => void
}) {
  const [sgthrs, setSgthrs] = React.useState("")
  const [tcoolthrs, setTcoolthrs] = React.useState("")
  const [testVel, setTestVel] = React.useState("")
  const [testTravel, setTestTravel] = React.useState("")
  const [homeTravel, setHomeTravel] = React.useState("")

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <IconActivity />
          TMC2209 / StallGuard
        </CardTitle>
        <CardDescription>
          Driver diagnostics and bounded sensorless homing.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!connected}
            onClick={() => onSend(fw.motorDriverStatus())}
          >
            Driver status
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!connected}
            onClick={() => onSend(fw.motorStallStatus())}
          >
            Stall status
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!connected}
            onClick={() =>
              onSend(fw.motorDriverConfigure(), "Driver re-configured")
            }
          >
            Reconfigure
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricPill
            label="UART"
            value={driver ? (driver.connection_ok ? "ok" : "fail") : "—"}
          />
          <MetricPill label="µsteps" value={driver?.microsteps ?? "—"} />
          <MetricPill
            label="Current"
            value={
              typeof driver?.rms_current_ma === "number"
                ? `${driver.rms_current_ma} mA`
                : "—"
            }
          />
          <MetricPill label="SG result" value={stall?.sg_result ?? "—"} />
          <MetricPill label="SG thresh" value={stall?.sg_threshold ?? "—"} />
          <MetricPill
            label="DIAG"
            value={stall ? (stall.diag_pin ? "high" : "low") : "—"}
          />
        </div>
        <Separator />
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label className="text-xs">SGTHRS (0–255)</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={sgthrs}
              onChange={(e) => setSgthrs(e.target.value)}
              disabled={!connected}
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">TCOOLTHRS</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={tcoolthrs}
              onChange={(e) => setTcoolthrs(e.target.value)}
              disabled={!connected}
            />
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!connected || !isNum(sgthrs) || !isNum(tcoolthrs)}
          onClick={() =>
            onSend(
              fw.motorStallConfig(Number(sgthrs), Number(tcoolthrs)),
              "StallGuard configured"
            )
          }
        >
          Apply StallGuard config
        </Button>
        <Separator />
        <p className="text-xs text-muted-foreground">
          Bounded moves — motor must be enabled, idle, and DIAG low.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label className="text-xs">Test mm/s (−8..8)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={testVel}
              onChange={(e) => setTestVel(e.target.value)}
              disabled={!connected}
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Max travel (≤10)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={testTravel}
              onChange={(e) => setTestTravel(e.target.value)}
              disabled={!connected}
            />
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!connected || !isNum(testVel) || !isNum(testTravel)}
          onClick={() =>
            onSend(
              fw.motorStallTest(Number(testVel), Number(testTravel)),
              "Stall test started"
            )
          }
        >
          Run stall test
        </Button>
        <NumberCommand
          label="Home: max travel (≤100 mm)"
          value={homeTravel}
          onChange={setHomeTravel}
          disabled={!connected}
          onSend={(n) =>
            onSend(fw.motorStallHome(n), "Sensorless homing started")
          }
        />
      </CardContent>
    </Card>
  )
}

function BusSensorCard({
  i2c,
  sensorStatuses,
  connected,
  onSend,
}: {
  i2c: { addresses: number[]; count: number } | null
  sensorStatuses: SensorStatusEntry[] | null
  connected: boolean
  onSend: (command: string, successMessage?: string) => void
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <IconScan />
          Bus &amp; sensors
        </CardTitle>
        <CardDescription>I²C scan and sensor startup state.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!connected}
            onClick={() => onSend(fw.i2cScan())}
          >
            Scan I²C
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!connected}
            onClick={() => onSend(fw.sensorStatus())}
          >
            Sensor status
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            I²C addresses{i2c ? ` · ${i2c.count}` : ""}
          </span>
          {i2c && i2c.addresses.length ? (
            <div className="flex flex-wrap gap-1">
              {i2c.addresses.map((addr) => (
                <Badge key={addr} variant="secondary" className="font-mono">
                  0x{addr.toString(16).toUpperCase()}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {connected ? "Run a scan to list devices." : "—"}
            </p>
          )}
        </div>
        <Separator />
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Sensors</span>
          {sensorStatuses && sensorStatuses.length ? (
            <dl className="grid grid-cols-2 gap-2">
              {sensorStatuses.map((s) => (
                <div key={s.name} className="rounded-md border p-2">
                  <dt className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium">{s.name}</span>
                    <span
                      className={
                        s.online
                          ? "text-green-600 dark:text-green-500"
                          : "text-destructive"
                      }
                    >
                      {s.online ? "online" : "offline"}
                    </span>
                  </dt>
                  <dd className="font-mono text-sm tabular-nums">
                    {s.rate_hz} Hz
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">
              {connected ? "Request status to list sensors." : "—"}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ConsoleCard({
  lines,
  connected,
  onSend,
}: {
  lines: string[]
  connected: boolean
  onSend: (command: string) => void
}) {
  const [input, setInput] = React.useState("")
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const command = input.trim()
    if (!command) return
    onSend(command)
    setInput("")
  }

  return (
    <Card className="md:col-span-2 xl:col-span-3" size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <IconTerminal2 />
          Console
        </CardTitle>
        <CardDescription>
          Raw serial feed and command input — e.g.{" "}
          <code className="font-mono">{`{"cmd":"motor.status"}`}</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div
          ref={scrollRef}
          className="h-56 overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-xs"
        >
          {lines.length ? (
            lines.map((line, index) => (
              <div key={index} className="break-all whitespace-pre-wrap">
                {line}
              </div>
            ))
          ) : (
            <span className="text-muted-foreground">
              {connected ? "No data yet" : "Connect the board to view output."}
            </span>
          )}
        </div>
        <form onSubmit={submit} className="flex gap-2">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={`{"cmd":"motor.status"}`}
            className="font-mono"
            disabled={!connected}
            aria-label="Console command"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!connected || !input.trim()}
          >
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function NumberCommand({
  label,
  value,
  onChange,
  disabled,
  onSend,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  onSend: (value: number) => void
}) {
  const parsed = Number(value)
  const valid = value.trim() !== "" && Number.isFinite(parsed)
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel className="text-xs">{label}</FieldLabel>
        <Input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </FieldContent>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || !valid}
        onClick={() => onSend(parsed)}
      >
        Send
      </Button>
    </Field>
  )
}

function SafetyChecklistDialog({
  open,
  checkedItems,
  onCheckedItemsChange,
  onOpenChange,
  onBegin,
}: {
  open: boolean
  checkedItems: boolean[]
  onCheckedItemsChange: (items: boolean[]) => void
  onOpenChange: (open: boolean) => void
  onBegin: () => void
}) {
  const complete = checkedItems.every(Boolean)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Safety checklist</DialogTitle>
          <DialogDescription>
            Confirm each item before starting the recording.
          </DialogDescription>
        </DialogHeader>
        <FieldSet>
          <FieldLegend variant="label">Pre-test checks</FieldLegend>
          <FieldGroup>
            {SAFETY_ITEMS.map((item, index) => (
              <Field key={item} orientation="horizontal">
                <Checkbox
                  id={`safety-${index}`}
                  checked={checkedItems[index]}
                  onCheckedChange={(checked) => {
                    const next = [...checkedItems]
                    next[index] = checked === true
                    onCheckedItemsChange(next)
                  }}
                />
                <FieldContent>
                  <FieldLabel
                    htmlFor={`safety-${index}`}
                    className="font-normal"
                  >
                    {item}
                  </FieldLabel>
                </FieldContent>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" disabled={!complete} onClick={onBegin}>
            Begin Test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SaveTestDialog({
  open,
  saveName,
  onSaveNameChange,
  sampleCount,
  frameCount,
  durationSeconds,
  rgbVideoBlob,
  hsiVideoBlob,
  rgbVideoError,
  hsiVideoError,
  saving,
  onSave,
  onDiscard,
}: {
  open: boolean
  saveName: string
  onSaveNameChange: (name: string) => void
  sampleCount: number
  frameCount: number
  durationSeconds: number
  rgbVideoBlob: Blob | null
  hsiVideoBlob: Blob | null
  rgbVideoError: string | null
  hsiVideoError: string | null
  saving: boolean
  onSave: () => void | Promise<void>
  onDiscard: () => void
}) {
  const videoError = [rgbVideoError, hsiVideoError].filter(Boolean).join(" | ")
  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Save test</DialogTitle>
          <DialogDescription>
            Download a zip containing JSON, RGB video, HSI video, and HSI JPEG
            frames.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <Label htmlFor="save-name">Test name</Label>
            <Input
              id="save-name"
              value={saveName}
              onChange={(event) => onSaveNameChange(event.target.value)}
            />
          </Field>
        </FieldGroup>
        <div className="grid grid-cols-3 gap-2">
          <MetricPill label="Duration" value={`${durationSeconds}s`} />
          <MetricPill label="Samples" value={sampleCount} />
          <MetricPill label="HSI frames" value={frameCount} />
          <MetricPill
            label="RGB WebM"
            value={
              rgbVideoBlob
                ? formatBytes(rgbVideoBlob.size)
                : rgbVideoError
                  ? "Error"
                  : "None"
            }
          />
          <MetricPill
            label="HSI WebM"
            value={
              hsiVideoBlob
                ? formatBytes(hsiVideoBlob.size)
                : hsiVideoError
                  ? "Error"
                  : "None"
            }
          />
        </div>
        {videoError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {videoError}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onDiscard}
          >
            Discard
          </Button>
          <Button type="button" disabled={saving} onClick={() => void onSave()}>
            {saving ? "Saving..." : "Save zip"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function preferredRecorderMimeType() {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
}

function createArchiveId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `archive-${Date.now()}`
}

function formatLocalTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(
      ""
    ) +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

function formatLocalDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${formatLocalClock(date)}`
}

function formatLocalClock(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function runArchiveBaseName(timestampLabel: string, psetId: string) {
  return sanitizeArchiveName(`${timestampLabel}-${psetId}`)
}

function clampFrameExportFps(value: number) {
  return Math.min(30, Math.max(1, Math.round(value)))
}

function frameCountForDuration(durationSeconds: number, fps: number) {
  const safeDuration = Math.max(0, durationSeconds)
  const safeFps = clampFrameExportFps(fps)
  return Math.max(
    1,
    Math.floor(Math.max(0, safeDuration - 0.000001) * safeFps) + 1
  )
}

function roundMs(value: number) {
  return Math.round(value * 1000) / 1000
}

function sampleElapsedMs(
  sample: FirmwareSample,
  sessionStartPerfMs: number | null,
  sessionStartMs: number | null
) {
  if (sessionStartPerfMs !== null) {
    if (typeof sample.syncedMs === "number") {
      return roundMs(sample.syncedMs - sessionStartPerfMs)
    }
    if (typeof sample.perfRecvMs === "number") {
      return roundMs(sample.perfRecvMs - sessionStartPerfMs)
    }
  }
  if (sessionStartMs !== null) {
    return roundMs(sample.receivedAt - sessionStartMs)
  }
  return null
}

function associatedFrame(
  elapsedMs: number | null,
  frames: CapturedFrame[]
): AssociatedFrame | null {
  if (elapsedMs === null || !frames.length) return null
  let best = frames[0]
  let bestDelta = Math.abs(frames[0].elapsedMs - elapsedMs)
  for (let i = 1; i < frames.length; i += 1) {
    const delta = Math.abs(frames[i].elapsedMs - elapsedMs)
    if (delta < bestDelta) {
      best = frames[i]
      bestDelta = delta
    }
  }
  return {
    frameNumber: best.frameNumber,
    filename: best.filename,
    elapsedMs: best.elapsedMs,
    deltaMs: roundMs(bestDelta),
  }
}

function buildExportedSamples(
  samples: FirmwareSample[],
  frames: CapturedFrame[],
  sessionStartPerfMs: number | null,
  sessionStartMs: number | null
): ExportedSample[] {
  return samples.map((sample) => {
    const elapsedMs = sampleElapsedMs(
      sample,
      sessionStartPerfMs,
      sessionStartMs
    )
    return {
      ...sample,
      elapsedMs,
      associatedFrame: associatedFrame(elapsedMs, frames),
    }
  })
}

async function extractJpegFramesFromVideo(
  videoBlob: Blob,
  timestampLabel: string,
  fps: number,
  sessionStartPerfMs: number | null,
  fallbackDurationSeconds: number
): Promise<CapturedFrame[]> {
  const url = URL.createObjectURL(videoBlob)
  const video = document.createElement("video")
  video.muted = true
  video.playsInline = true
  video.preload = "auto"
  video.src = url

  try {
    await waitForMediaEvent(video, "loadedmetadata")
    if (video.readyState < 2) {
      await waitForMediaEvent(video, "loadeddata")
    }

    const metadataDuration =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : null
    const exportDuration =
      metadataDuration ??
      (Number.isFinite(fallbackDurationSeconds) && fallbackDurationSeconds > 0
        ? fallbackDurationSeconds
        : null)
    if (!exportDuration) return []
    await seekVideo(video, 0)

    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    if (!canvas.width || !canvas.height) return []
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Browser canvas capture is unavailable.")

    const safeFps = clampFrameExportFps(fps)
    const frameCount = frameCountForDuration(exportDuration, safeFps)
    const maxSeekTime = Math.max(
      0,
      (metadataDuration ?? exportDuration) - 0.001
    )
    const frames: CapturedFrame[] = []
    for (let index = 0; index < frameCount; index += 1) {
      const elapsedMs = roundMs((index * 1000) / safeFps)
      const timeSeconds = Math.min(index / safeFps, maxSeekTime)
      await seekVideo(video, timeSeconds)
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY)
      const frameNumber = index + 1
      frames.push({
        frameNumber,
        filename: `${timestampLabel}-Frame${String(frameNumber).padStart(
          6,
          "0"
        )}.jpg`,
        elapsedMs,
        perfMs:
          sessionStartPerfMs !== null
            ? roundMs(sessionStartPerfMs + elapsedMs)
            : elapsedMs,
        blob,
      })
    }
    return frames
  } finally {
    URL.revokeObjectURL(url)
    video.removeAttribute("src")
    video.load()
  }
}

function waitForMediaEvent(
  element: HTMLMediaElement,
  eventName: keyof HTMLMediaElementEventMap
) {
  return new Promise<void>((resolve, reject) => {
    const onEvent = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error("Video frame extraction failed."))
    }
    const cleanup = () => {
      element.removeEventListener(eventName, onEvent)
      element.removeEventListener("error", onError)
    }
    element.addEventListener(eventName, onEvent, { once: true })
    element.addEventListener("error", onError, { once: true })
  })
}

async function seekVideo(video: HTMLVideoElement, timeSeconds: number) {
  if (
    Math.abs(video.currentTime - timeSeconds) < 0.001 &&
    video.readyState >= 2
  ) {
    return
  }
  video.currentTime = timeSeconds
  await waitForMediaEvent(video, "seeked")
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("JPEG frame encoding failed."))
      },
      type,
      quality
    )
  })
}
