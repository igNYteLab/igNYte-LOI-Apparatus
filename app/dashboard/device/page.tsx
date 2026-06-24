"use client"

import { useMemo } from "react"

import { useDevice, type DeviceStatus } from "@/components/device-provider"
import { IdleBoardState } from "@/components/test-monitor/idle-board-state"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { observedSampleRates } from "@/lib/firmware"
import { cn } from "@/lib/utils"

const STATUS_LABEL: Record<DeviceStatus, string> = {
  unsupported: "Not supported",
  disconnected: "Disconnected",
  connecting: "Connecting…",
  connected: "Connected",
}

const STATUS_DOT: Record<DeviceStatus, string> = {
  unsupported: "bg-destructive",
  disconnected: "bg-muted-foreground/40",
  connecting: "bg-amber-500 animate-pulse",
  connected: "bg-green-500",
}

export default function DeviceBoardPage() {
  const {
    supported,
    status,
    error,
    lines,
    samples,
    log,
    sync,
    connect,
    disconnect,
  } = useDevice()

  const connected = status === "connected"
  const busy = status === "connecting"
  const sensorEntries = Object.values(samples).sort((a, b) =>
    a.sensor.localeCompare(b.sensor),
  )
  const rates = useMemo(() => observedSampleRates(log), [log])

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={cn("size-2.5 rounded-full", STATUS_DOT[status])}
            aria-hidden
          />
          <div>
            <h1 className="text-lg font-medium">Device Board</h1>
            <p className="text-sm text-muted-foreground">
              {STATUS_LABEL[status]} · live view only, nothing is recorded
              {connected
                ? sync.calibrated
                  ? " · clock synced"
                  : " · clock syncing…"
                : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {connected ? "On" : "Off"}
          </span>
          <Switch
            checked={connected || busy}
            disabled={!supported || busy}
            onCheckedChange={(checked) => {
              if (checked) {
                void connect()
              } else {
                void disconnect()
              }
            }}
            aria-label="Toggle device connection"
          />
        </div>
      </div>

      {!supported ? (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Web Serial isn&apos;t available in this browser. Use Chrome or Edge
            over localhost/HTTPS to connect the board.
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid flex-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <IdleBoardState />

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-base">Sensor / steady-state</CardTitle>
            <CardDescription>
              Latest telemetry parsed from the board.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {sensorEntries.length ? (
              <dl className="grid grid-cols-2 gap-3 text-sm @container">
                {sensorEntries.map((sample) => (
                  <div key={sample.sensor} className="rounded-md border px-3 py-2">
                    <dt className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{sample.sensor}</span>
                      {rates[sample.sensor] !== undefined ? (
                        <span className="tabular-nums">
                          {rates[sample.sensor].toFixed(1)} Hz
                        </span>
                      ) : null}
                    </dt>
                    <dd className="font-mono font-medium">
                      {typeof sample.o2_vol_pct === "number"
                        ? `${sample.o2_vol_pct.toFixed(2)} % O₂`
                        : typeof sample.temp_c === "number"
                          ? `${sample.temp_c.toFixed(1)} °C`
                          : typeof sample.pct === "number"
                            ? `${sample.pct.toFixed(1)} %`
                            : "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                {connected ? "Waiting for telemetry…" : "Connect to view data."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col">
          <CardHeader>
            <CardTitle className="text-base">Serial feed</CardTitle>
            <CardDescription>Raw incoming lines (most recent).</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col">
            <div className="h-[320px] overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-xs lg:h-full">
              {lines.length ? (
                lines.map((line, index) => (
                  <div key={index} className="whitespace-pre-wrap">
                    {line}
                  </div>
                ))
              ) : (
                <span className="text-muted-foreground">No data yet</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
