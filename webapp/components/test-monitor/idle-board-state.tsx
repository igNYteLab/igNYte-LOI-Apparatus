"use client"

import { IconGauge } from "@tabler/icons-react"

import { useDevice } from "@/components/device-provider"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function IdleBoardState() {
  const { status, boot, motor } = useDevice()

  const connection =
    status === "connected"
      ? "Live"
      : status === "connecting"
        ? "Connecting"
        : "Offline"

  const readouts = [
    { label: "Boot", value: boot ? boot.status : "—" },
    { label: "Motor", value: motor ? (motor.enabled ? "enabled" : "disabled") : "—" },
    {
      label: "Position",
      value: motor ? `${motor.position_mm.toFixed(2)} mm` : "—",
    },
    {
      label: "Endstop",
      value: motor ? (motor.endstop_active ? "active" : "clear") : "—",
    },
  ]

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <IconGauge />
          Rig State
        </CardTitle>
        <CardDescription>Connection, boot, and motor state.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              connection === "Live"
                ? "default"
                : connection === "Offline"
                  ? "destructive"
                  : "secondary"
            }
          >
            {connection}
          </Badge>
          {boot ? (
            <Badge variant={boot.ready ? "secondary" : "outline"}>
              {boot.status}
            </Badge>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {readouts.map((item) => (
            <div key={item.label} className="rounded-md border px-3 py-2">
              <dt className="truncate text-xs text-muted-foreground">
                {item.label}
              </dt>
              <dd className="font-mono font-medium tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
