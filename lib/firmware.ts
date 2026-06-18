// IgNYte-FPA ESP32-P4 USB serial protocol: newline-delimited JSON.
// Telemetry is per-sensor and event-based (no combined frame). `t_us` is a
// monotonic MCU microsecond timestamp, NOT wall-clock — the host stamps its
// own `receivedAt` on every line for experiment-time correlation.

export const BAUD_RATE = 115200

export const SENSOR_NAMES = [
  "tc1",
  "tc2",
  "tc3",
  "tc4",
  "sht45",
  "bme688",
  "d6f_v03a1",
] as const

/** A single sensor sample. Fields are a union across sample kinds; only the
 *  ones relevant to a given `kind` are present. */
export type FirmwareSample = {
  type: "sample"
  kind: string
  sensor: string
  t_us: number
  /** Host receive timestamp in ms (added on parse, not from the board). */
  receivedAt: number
  ok?: boolean
  // thermocouple
  temp_c?: number
  cold_junction_c?: number
  fault?: number
  valid?: boolean
  // environment (sht45 / bme688)
  rh_pct?: number
  pressure_hpa?: number
  gas_kohm?: number
  // analog flow velocity (d6f_v03a1)
  raw_adc?: number
  voltage_v?: number
  velocity_m_s?: number
  // flow controller (flow1 / flow2)
  raw?: number
  pct?: number
}

/** A status / event / command-response message. */
export type FirmwareStatus = {
  type: "status"
  t_us?: number
  receivedAt: number
  component: string
  status: string
  detail?: string
  severity?: string
  // motor "state" extras
  enabled?: boolean
  endstop_active?: boolean
  velocity_mode?: boolean
  position_steps?: number
  position_mm?: number
}

export type MotorState = {
  enabled: boolean
  endstop_active: boolean
  velocity_mode: boolean
  position_steps: number
  position_mm: number
  updatedAt: number
}

export type ParsedLine =
  | { kind: "sample"; sample: FirmwareSample }
  | { kind: "status"; status: FirmwareStatus }
  | { kind: "debug"; text: string }

/**
 * Parse one serial line. Only lines that begin with `{` and parse as JSON with
 * a recognized `type` become structured; everything else (ESP ROM/boot text,
 * blank lines, malformed JSON) is returned as `debug` so the host can log it.
 */
export function parseFirmwareLine(line: string, receivedAt: number): ParsedLine {
  const trimmed = line.trim()
  if (!trimmed.startsWith("{")) return { kind: "debug", text: trimmed }

  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    return { kind: "debug", text: trimmed }
  }

  if (obj.type === "sample" && typeof obj.sensor === "string") {
    return { kind: "sample", sample: { ...obj, receivedAt } as FirmwareSample }
  }
  if (obj.type === "status" && typeof obj.component === "string") {
    return { kind: "status", status: { ...obj, receivedAt } as FirmwareStatus }
  }
  return { kind: "debug", text: trimmed }
}

/** True for the boot status that signals the host may start commanding. */
export function isBootReady(status: FirmwareStatus) {
  return (
    status.component === "boot" &&
    (status.status === "ready" || status.status === "ready_with_warnings")
  )
}

export function clampPct(value: number) {
  return Math.min(100, Math.max(0, value))
}

// ---- Command builders (host -> board), one JSON object per line. ----
export const fw = {
  motorStatus: () => JSON.stringify({ cmd: "motor.status" }),
  motorEnable: () => JSON.stringify({ cmd: "motor.enable" }),
  motorDisable: () => JSON.stringify({ cmd: "motor.disable" }),
  motorStop: () => JSON.stringify({ cmd: "motor.stop" }),
  motorHomeHere: () => JSON.stringify({ cmd: "motor.home_here" }),
  motorMoveSteps: (steps: number) =>
    JSON.stringify({ cmd: "motor.move_steps", steps: Math.round(steps) }),
  motorTargetMm: (mm: number) =>
    JSON.stringify({ cmd: "motor.target_mm", mm }),
  motorVelocity: (mm_s: number) =>
    JSON.stringify({ cmd: "motor.velocity_mm_s", mm_s }),
  flowSet: (channel: number, pct: number) =>
    JSON.stringify({ cmd: "flow.set", channel, pct: clampPct(pct) }),
  sensorRate: (sensor: string, hz: number) =>
    JSON.stringify({ cmd: "sensor.rate", sensor, hz: Math.max(0, Math.round(hz)) }),
}
