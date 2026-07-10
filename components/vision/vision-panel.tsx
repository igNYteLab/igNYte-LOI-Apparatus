"use client"

import * as React from "react"
import {
  IconCamera,
  IconCameraOff,
  IconTargetArrow,
} from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import type { ControllerMode } from "@/lib/vision/config"
import {
  useFlameTracker,
  type CameraConstraintValues,
} from "@/components/vision/use-flame-tracker"
import { useOpenCv } from "@/components/vision/use-opencv"

function NumField({
  label,
  value,
  step,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string
  value: number
  step?: number
  min?: number
  max?: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === "") return
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    </div>
  )
}

function VisionPanelComponent({
  connected,
  sendCommand,
  disableRef,
}: {
  connected: boolean
  sendCommand: (command: string) => Promise<void>
  disableRef: React.MutableRefObject<(() => void) | null>
}) {
  const {
    cv,
    status: cvStatus,
    error: cvError,
    detail: cvDetail,
    load: loadCv,
  } = useOpenCv()
  const tracker = useFlameTracker({ cv, connected, sendCommand })
  const {
    config,
    patchCamera,
    patchController,
    patchDetector,
    running,
    autoControl,
    cameraError,
    cameraControlError,
    cameraReportText,
    cameraDevices,
    cameraDeviceId,
    status,
    videoRef,
    frameCanvasRef,
    overlayCanvasRef,
    maskCanvasRef,
  } = tracker

  // Let the E-STOP (in the parent) drop auto control instantly.
  React.useEffect(() => {
    disableRef.current = tracker.disableAutoControl
    return () => {
      disableRef.current = null
    }
  }, [tracker.disableAutoControl, disableRef])

  const ctrl = config.controller
  const det = config.detector
  const cam = config.camera
  const cvReady = cvStatus === "ready"
  const canAuto = running && connected && cvReady
  const [cameraControls, setCameraControls] =
    React.useState<CameraConstraintValues>({
      exposureMode: "none",
      exposureTime: "",
      whiteBalanceMode: "none",
      colorTemperature: "",
    })

  const setCameraControl = React.useCallback(
    (patch: Partial<CameraConstraintValues>) => {
      setCameraControls((current) => ({ ...current, ...patch }))
    },
    [],
  )

  const applyCameraControls = React.useCallback(() => {
    void tracker.applyCameraConstraints({
      exposureMode:
        cameraControls.exposureMode === "none" ? "" : cameraControls.exposureMode,
      exposureTime: cameraControls.exposureTime,
      whiteBalanceMode:
        cameraControls.whiteBalanceMode === "none"
          ? ""
          : cameraControls.whiteBalanceMode,
      colorTemperature: cameraControls.colorTemperature,
    })
  }, [cameraControls, tracker])

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* Live view + status */}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <IconTargetArrow />
            Flame Tracking
          </CardTitle>
          <CardDescription>
            OpenCV.js bottom-of-flame tracker → motor velocity.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                cvStatus === "ready"
                  ? "secondary"
                  : cvStatus === "error"
                    ? "destructive"
                    : "outline"
              }
            >
              OpenCV: {cvStatus}
            </Badge>
            <Badge variant={status.tracking ? "default" : "outline"}>
              {status.tracking
                ? `tracking · ${(status.confidence * 100).toFixed(0)}%`
                : "no target"}
            </Badge>
            {running ? (
              <Badge variant="secondary">{status.processedFps.toFixed(1)} fps</Badge>
            ) : null}
            {autoControl ? (
              <Badge variant="destructive" className="animate-pulse">
                AUTO
              </Badge>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-md border bg-black/40">
            <canvas ref={overlayCanvasRef} className="h-auto w-full" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Error (px)" value={status.errorYPx ?? "—"} />
            <Metric
              label="Velocity"
              value={
                status.recommendation
                  ? `${status.recommendation.velocity_mm_s} mm/s`
                  : "0 (hold)"
              }
            />
            <Metric label="Setpoint y" value={status.setpointYPx} />
          </div>
          <div>
            <div className="text-muted-foreground mb-1 text-xs">Orange/yellow mask</div>
            <div className="overflow-hidden rounded-md border bg-black/40">
              <canvas ref={maskCanvasRef} className="h-auto w-full" />
            </div>
          </div>

          {/* Offscreen sources */}
          <video ref={videoRef} playsInline muted className="hidden" />
          <canvas ref={frameCanvasRef} className="hidden" />
        </CardContent>
      </Card>

      {/* Controls */}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <IconCamera />
            Camera &amp; Control
          </CardTitle>
          <CardDescription>
            Auto control drives the motor from tracking — off by default.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {cvError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {cvError}
            </p>
          ) : null}
          {cvDetail && cvStatus === "loading" ? (
            <p className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
              {cvDetail}
            </p>
          ) : null}
          {cameraError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {cameraError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {running ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => tracker.stopCamera()}
              >
                <IconCameraOff /> Stop camera
              </Button>
            ) : cvStatus === "ready" ? (
              <Button size="sm" onClick={() => void tracker.startCamera()}>
                <IconCamera /> Start camera
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={cvStatus === "loading"}
                onClick={() => loadCv()}
              >
                {cvStatus === "loading" ? "Loading OpenCV…" : "Load vision engine"}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={!canAuto}
              onClick={() => tracker.sendOnce()}
            >
              Send once
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!connected}
              onClick={() => tracker.calibrate()}
            >
              Calibrate axis
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-md border p-2">
            <div>
              <div className="text-sm font-medium">Auto control</div>
              <div className="text-muted-foreground text-xs">
                Sends velocity at {ctrl.autoControlHz} Hz · confidence-gated · 0 on
                loss
              </div>
            </div>
            <Switch
              checked={autoControl}
              disabled={!canAuto}
              onCheckedChange={(v) => tracker.setAutoControlOn(v)}
              aria-label="Auto control"
            />
          </div>

          <Separator />
          <div className="text-xs font-medium">Camera</div>
          <div className="grid gap-2">
            <Label className="text-xs">Device</Label>
            <Select
              value={cameraDeviceId || "default"}
              disabled={running}
              onValueChange={(value) =>
                tracker.setCameraDeviceId(value === "default" ? "" : value)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default camera</SelectItem>
                {cameraDevices.map((device, index) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <NumField
              label="Capture W"
              value={cam.widthPx}
              step={16}
              min={160}
              disabled={running}
              onChange={(v) => patchCamera({ widthPx: Math.round(v) })}
            />
            <NumField
              label="Capture H"
              value={cam.heightPx}
              step={16}
              min={120}
              disabled={running}
              onChange={(v) => patchCamera({ heightPx: Math.round(v) })}
            />
            <NumField
              label="Camera FPS"
              value={cam.fps}
              step={1}
              min={1}
              max={60}
              disabled={running}
              onChange={(v) => patchCamera({ fps: Math.round(v) })}
            />
            <NumField
              label="Analysis W"
              value={cam.analysisWidthPx}
              step={16}
              min={80}
              max={cam.widthPx}
              onChange={(v) => patchCamera({ analysisWidthPx: Math.round(v) })}
            />
            <NumField
              label="Analysis H"
              value={cam.analysisHeightPx}
              step={16}
              min={60}
              max={cam.heightPx}
              onChange={(v) => patchCamera({ analysisHeightPx: Math.round(v) })}
            />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-1">
              <Label className="text-xs">Exposure mode</Label>
              <Select
                value={cameraControls.exposureMode}
                disabled={!running}
                onValueChange={(value) => setCameraControl({ exposureMode: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No change</SelectItem>
                  <SelectItem value="manual">manual</SelectItem>
                  <SelectItem value="continuous">continuous</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">White balance mode</Label>
              <Select
                value={cameraControls.whiteBalanceMode}
                disabled={!running}
                onValueChange={(value) =>
                  setCameraControl({ whiteBalanceMode: value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No change</SelectItem>
                  <SelectItem value="manual">manual</SelectItem>
                  <SelectItem value="continuous">continuous</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Exposure time</Label>
              <Input
                type="number"
                step={1}
                value={cameraControls.exposureTime}
                disabled={!running}
                placeholder="if supported"
                onChange={(event) =>
                  setCameraControl({ exposureTime: event.target.value })
                }
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Color temperature</Label>
              <Input
                type="number"
                step={1}
                value={cameraControls.colorTemperature}
                disabled={!running}
                placeholder="if supported"
                onChange={(event) =>
                  setCameraControl({ colorTemperature: event.target.value })
                }
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!running}
              onClick={applyCameraControls}
            >
              Apply camera controls
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!running}
              onClick={() => tracker.refreshCameraReport()}
            >
              Refresh camera report
            </Button>
          </div>
          {cameraControlError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {cameraControlError}
            </p>
          ) : null}
          <pre className="max-h-32 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[10px] leading-tight">
            {cameraReportText}
          </pre>

          <Separator />
          <div className="text-xs font-medium">Controller</div>
          <div className="grid gap-2">
            <Label className="text-xs">Mode</Label>
            <Select
              value={ctrl.mode}
              onValueChange={(v) => patchController({ mode: v as ControllerMode })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="p">P (proportional)</SelectItem>
                <SelectItem value="pi">PI (proportional-integral)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border p-2">
            <div>
              <div className="text-sm font-medium">Feedforward</div>
              <div className="text-muted-foreground text-xs">
                Adds image-velocity compensation to the feedback command.
              </div>
            </div>
            <Switch
              checked={ctrl.feedforwardEnabled}
              onCheckedChange={(v) =>
                patchController({ feedforwardEnabled: Boolean(v) })
              }
              aria-label="Feedforward"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="Setpoint (0–1)"
              value={ctrl.setpointYNorm}
              step={0.01}
              min={0}
              max={1}
              onChange={(v) => patchController({ setpointYNorm: v })}
            />
            <NumField
              label="Deadband (px)"
              value={ctrl.deadbandPx}
              step={1}
              min={0}
              onChange={(v) => patchController({ deadbandPx: v })}
            />
            <NumField
              label="Kp (mm/s·px)"
              value={ctrl.kpMmSPerPx}
              step={0.01}
              onChange={(v) => patchController({ kpMmSPerPx: v })}
            />
            <NumField
              label="Ki (mm/s·px·s)"
              value={ctrl.kiMmSPerPxS}
              step={0.01}
              disabled={ctrl.mode !== "pi"}
              onChange={(v) => patchController({ kiMmSPerPxS: v })}
            />
            <NumField
              label="FF gain"
              value={ctrl.feedforwardGain}
              step={0.05}
              min={0}
              disabled={!ctrl.feedforwardEnabled}
              onChange={(v) => patchController({ feedforwardGain: v })}
            />
            <NumField
              label="mm / px"
              value={ctrl.mmPerPx}
              step={0.005}
              min={0}
              disabled={!ctrl.feedforwardEnabled}
              onChange={(v) => patchController({ mmPerPx: v })}
            />
            <NumField
              label="Image vel alpha"
              value={ctrl.imageVelocityAlpha}
              step={0.05}
              min={0}
              max={1}
              disabled={!ctrl.feedforwardEnabled}
              onChange={(v) => patchController({ imageVelocityAlpha: v })}
            />
            <NumField
              label="Motor accel"
              value={ctrl.motorAccelerationMmS2}
              step={1}
              min={0}
              disabled={!ctrl.feedforwardEnabled}
              onChange={(v) => patchController({ motorAccelerationMmS2: v })}
            />
            <NumField
              label="Control sign"
              value={ctrl.controlSign}
              step={2}
              min={-1}
              max={1}
              onChange={(v) => patchController({ controlSign: v >= 0 ? 1 : -1 })}
            />
            <NumField
              label="Max vel (mm/s)"
              value={ctrl.maxVelocityMmS}
              step={0.5}
              min={0}
              onChange={(v) => patchController({ maxVelocityMmS: v })}
            />
            <NumField
              label="Process FPS"
              value={ctrl.processFps}
              step={1}
              min={1}
              max={60}
              onChange={(v) => patchController({ processFps: v })}
            />
            <NumField
              label="Auto Hz"
              value={ctrl.autoControlHz}
              step={1}
              min={1}
              max={50}
              onChange={(v) => patchController({ autoControlHz: v })}
            />
          </div>

          <Separator />
          <div className="text-xs font-medium">Detector (HSV, OpenCV H 0–180)</div>
          <div className="grid grid-cols-3 gap-2">
            <NumField label="H low" value={det.hsvLow.h} min={0} max={180} onChange={(v) => patchDetector({ hsvLow: { ...det.hsvLow, h: v } })} />
            <NumField label="S low" value={det.hsvLow.s} min={0} max={255} onChange={(v) => patchDetector({ hsvLow: { ...det.hsvLow, s: v } })} />
            <NumField label="V low" value={det.hsvLow.v} min={0} max={255} onChange={(v) => patchDetector({ hsvLow: { ...det.hsvLow, v: v } })} />
            <NumField label="H high" value={det.hsvHigh.h} min={0} max={180} onChange={(v) => patchDetector({ hsvHigh: { ...det.hsvHigh, h: v } })} />
            <NumField label="S high" value={det.hsvHigh.s} min={0} max={255} onChange={(v) => patchDetector({ hsvHigh: { ...det.hsvHigh, s: v } })} />
            <NumField label="V high" value={det.hsvHigh.v} min={0} max={255} onChange={(v) => patchDetector({ hsvHigh: { ...det.hsvHigh, v: v } })} />
            <NumField label="Min area" value={det.minAreaPx} step={50} min={0} onChange={(v) => patchDetector({ minAreaPx: v })} />
            <NumField label="Kernel px" value={det.kernelSizePx} step={1} min={1} onChange={(v) => patchDetector({ kernelSizePx: v })} />
          </div>

          <Separator />
          <div className="text-xs font-medium">vision.tracking</div>
          <pre className="max-h-40 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[10px] leading-tight">
            {status.message ? JSON.stringify(status.message, null, 2) : "—"}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}

export const VisionPanel = React.memo(VisionPanelComponent)

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-muted-foreground truncate text-xs">{label}</div>
      <div className="font-mono text-sm font-medium tabular-nums">{value}</div>
    </div>
  )
}
