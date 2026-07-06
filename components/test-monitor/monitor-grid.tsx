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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
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

type MonitorGridProps = {
  context?: {
    operator?: string
    sample?: string
    testId?: string
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
    motor,
    boot,
    driver,
    stall,
    sensorStatuses,
    i2c,
    sync,
    connect: connectDevice,
    sendCommand,
  } = useDevice()

  const rgbCameraRef = React.useRef<CameraController | null>(null)
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  // Set by the Vision tab so E-STOP can drop auto-control instantly.
  const visionDisableRef = React.useRef<(() => void) | null>(null)

  const [safetyOpen, setSafetyOpen] = React.useState(false)
  const [checkedItems, setCheckedItems] = React.useState<boolean[]>(
    SAFETY_ITEMS.map(() => false),
  )
  const [recording, setRecording] = React.useState(false)
  const [sessionStartMs, setSessionStartMs] = React.useState<number | null>(null)
  const [sessionStartedAt, setSessionStartedAt] = React.useState<string | null>(
    null,
  )
  const [sessionStoppedAt, setSessionStoppedAt] = React.useState<string | null>(
    null,
  )
  const [sessionSamples, setSessionSamples] = React.useState<FirmwareSample[]>(
    [],
  )
  const [videoBlob, setVideoBlob] = React.useState<Blob | null>(null)
  const [videoError, setVideoError] = React.useState<string | null>(null)
  const [saveOpen, setSaveOpen] = React.useState(false)
  const [saveName, setSaveName] = React.useState("")
  const [clockNow, setClockNow] = React.useState(0)

  const connected = deviceStatus === "connected"
  const operator =
    context?.operator ?? user?.displayName ?? user?.email ?? "Operator"
  const sampleLabel = context?.sample ?? context?.testId ?? "LOI specimen"
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
          Math.round(
            (new Date(sessionStoppedAt).getTime() -
              new Date(sessionStartedAt).getTime()) /
              1000,
          ),
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
        `E-STOP: ${failures} of ${commands.length} commands failed — verify the rig is safe.`,
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
    const startMs = Date.now()
    chunksRef.current = []
    setSessionStartMs(startMs)
    setSessionStartedAt(new Date(startMs).toISOString())
    setSessionStoppedAt(null)
    setSessionSamples([])
    setVideoBlob(null)
    setVideoError(null)
    setClockNow(startMs)
    setRecording(true)

    try {
      if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder is not available in this browser.")
      }
      const stream = await rgbCameraRef.current?.getRecordingStream()
      if (!stream) throw new Error("RGB camera stream is unavailable.")
      const mimeType = preferredRecorderMimeType()
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      )
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = chunksRef.current.length
          ? new Blob(chunksRef.current, {
              type: recorder.mimeType || "video/webm",
            })
          : null
        setVideoBlob(blob)
        rgbCameraRef.current?.stopRecordingCapture()
        setSaveOpen(true)
      }
      recorder.start(1000)
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "Video capture failed.")
      recorderRef.current = null
    }
  }

  function stopRecording() {
    const stopMs = Date.now()
    setSessionStoppedAt(new Date(stopMs).toISOString())
    setSaveName(defaultArchiveName(sessionStartedAt ?? new Date(stopMs).toISOString()))
    setClockNow(stopMs)
    setRecording(false)
    // Capture every sample received during the session window.
    const start = sessionStartMs ?? stopMs
    setSessionSamples(
      log.filter((s) => s.receivedAt >= start && s.receivedAt <= stopMs),
    )

    const recorder = recorderRef.current
    if (recorder && recorder.state !== "inactive") {
      recorder.stop()
    } else {
      rgbCameraRef.current?.stopRecordingCapture()
      setSaveOpen(true)
    }
  }

  function clearSession() {
    recorderRef.current = null
    chunksRef.current = []
    setRecording(false)
    setSessionStartMs(null)
    setSessionStartedAt(null)
    setSessionStoppedAt(null)
    setSessionSamples([])
    setVideoBlob(null)
    setVideoError(null)
    setSaveOpen(false)
  }

  function saveArchive() {
    if (!sessionStartedAt || !sessionStoppedAt) return
    const safeName = sanitizeArchiveName(saveName)
    const videoFile = videoBlob ? `${safeName}.webm` : null
    const meta = {
      name: saveName.trim() || safeName,
      startedAt: sessionStartedAt,
      stoppedAt: sessionStoppedAt,
      durationSeconds: sessionDurationSeconds,
      sampleCount: sessionSamples.length,
      operator,
      sample: sampleLabel,
      videoFile,
      videoError,
    }
    const entry: TestArchiveEntry = {
      id: createArchiveId(),
      meta,
      samples: sessionSamples,
    }

    downloadTextFile(
      `${safeName}.json`,
      JSON.stringify({ meta, samples: sessionSamples }, null, 2),
    )
    if (videoBlob && videoFile) {
      downloadBlobFile(videoFile, videoBlob)
    }
    appendTestArchive(entry)
    // Mirror the save into the local DB (db/schema.sql shape) — best effort,
    // never blocks the archive flow.
    try {
      recordCompletedTest({
        sample: { externalId: sampleLabel },
        run: {
          externalTestId: context?.testId ?? null,
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
    clearSession()
  }

  function downloadCurrentData() {
    if (!log.length) {
      toast.error("No samples have been received yet.")
      return
    }
    const filename = `samples_${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    downloadTextFile(filename, JSON.stringify(log, null, 2))
  }

  return (
    <>
      <Tabs
        defaultValue="monitoring"
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
            </div>
            <div className="min-h-0 lg:col-span-4">
              <CameraCard
                title="Hyperspectral Camera"
                description="Monitoring-only HSI view."
                storageKey="ignyte.camera.hsi.source"
                streamUrl={process.env.NEXT_PUBLIC_HSI_CAMERA_URL}
                recordable={false}
                recording={recording}
                variant="hsi"
              />
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
                  <MetricPill label="Buffer" value={`${log.length} samples`} />
                  <MetricPill
                    label="Started"
                    value={
                      sessionStartedAt ? sessionStartedAt.slice(11, 19) : "—"
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
              <CardFooter className="flex flex-wrap gap-2">
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
                  New Test
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
            <MotorControlCard motor={motor} connected={connected} onSend={send} />
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
        durationSeconds={sessionDurationSeconds}
        videoBlob={videoBlob}
        videoError={videoError}
        onSave={saveArchive}
        onDiscard={clearSession}
      />
    </>
  )
}

function ConnectionBadge({ state }: { state: "Live" | "Connecting" | "Offline" }) {
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

function MetricPill({ label, value }: { label: string; value: React.ReactNode }) {
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
    a.sensor.localeCompare(b.sensor),
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
  valueOf: (s: FirmwareSample) => number | undefined,
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
        className="min-h-[150px] aspect-auto"
        initialDimension={{ width: 320, height: 160 }}
      >
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
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
                      {typeof value === "number" ? value.toFixed(2) : String(value)}
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
  motor: { enabled: boolean; position_mm: number; position_steps: number; endstop_active: boolean; velocity_mode: boolean } | null
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
          <Button size="sm" variant="outline" disabled={!connected} onClick={() => onSend(fw.motorEnable(), "Motor enable sent")}>Enable</Button>
          <Button size="sm" variant="outline" disabled={!connected} onClick={() => onSend(fw.motorDisable(), "Motor disable sent")}>Disable</Button>
          <Button size="sm" variant="destructive" disabled={!connected} onClick={() => onSend(fw.motorStop(), "Stop sent")}>Stop</Button>
          <Button size="sm" variant="outline" disabled={!connected} onClick={() => onSend(fw.motorHomeHere(), "Home-here sent")}>Home here</Button>
          <Button size="sm" variant="ghost" disabled={!connected} onClick={() => onSend(fw.motorStatus())} aria-label="Refresh motor status">
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
                      `Move to ${Math.max(0, target).toFixed(2)} mm`,
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
          onSend={(n) => onSend(fw.motorMoveSteps(n), `Move ${Math.round(n)} steps sent`)}
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
          <MetricPill label="Flow 1" value={`${fmt(samples.flow1?.pct, 1)} %`} />
          <MetricPill label="Flow 2" value={`${fmt(samples.flow2?.pct, 1)} %`} />
        </div>
        <Field>
          <FieldLabel>Channel</FieldLabel>
          <Select value={channel} onValueChange={setChannel} disabled={!connected}>
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
        <CardDescription>Set a sensor&apos;s rate (0 disables).</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field>
          <FieldLabel>Sensor</FieldLabel>
          <Select value={sensor} onValueChange={setSensor} disabled={!connected}>
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
          onSend={(n) => onSend(fw.sensorRate(sensor, n), `${sensor} → ${Math.round(n)} Hz`)}
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
        <div className="grid grid-cols-3 gap-2">
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
              "StallGuard configured",
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
              "Stall test started",
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
          onSend={(n) => onSend(fw.motorStallHome(n), "Sensorless homing started")}
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
              <div key={index} className="whitespace-pre-wrap break-all">
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
          <Button type="submit" size="sm" disabled={!connected || !input.trim()}>
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
                  <FieldLabel htmlFor={`safety-${index}`} className="font-normal">
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
  durationSeconds,
  videoBlob,
  videoError,
  onSave,
  onDiscard,
}: {
  open: boolean
  saveName: string
  onSaveNameChange: (name: string) => void
  sampleCount: number
  durationSeconds: number
  videoBlob: Blob | null
  videoError: string | null
  onSave: () => void
  onDiscard: () => void
}) {
  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Save test</DialogTitle>
          <DialogDescription>
            Download sensor samples and the RGB camera recording if capture
            succeeded.
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
          <MetricPill
            label="Video"
            value={
              videoBlob ? formatBytes(videoBlob.size) : videoError ? "Error" : "None"
            }
          />
        </div>
        {videoError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {videoError}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDiscard}>
            Discard
          </Button>
          <Button type="button" onClick={onSave}>
            Save
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

function defaultArchiveName(timestamp: string) {
  return `loi_test_${timestamp.replace(/[:.]/g, "-")}`
}
