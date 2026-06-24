// IgNYte-FPA ESP32-P4 USB serial protocol: newline-delimited JSON, one object
// per line at 115200 baud (accepts `\n` or `\r\n`). Telemetry is per-sensor and
// event-based (no combined frame). `t_us` is a monotonic MCU microsecond
// timestamp, NOT wall-clock — the host stamps its own `receivedAt` on every
// line for experiment-time correlation. This mirrors the firmware contract in
// the board repo's firmware-serial-protocol.md / jsoncommands.md.

export const BAUD_RATE = 115200

// Sensors instantiated in the current ESP32-P4 build, and the only valid
// `sensor.rate` targets (`o2` is the DFRobot SEN0496 oxygen sensor at 0x70).
// `d6f_v03a1` is intentionally NOT listed: its analog pin (GPIO 23) is now the
// TMC2209 UART TX pin, so it is not instantiated in this build. Its sample
// shape is retained below for future hardware.
export const SENSOR_NAMES = [
  "tc1",
  "tc2",
  "tc3",
  "tc4",
  "sht45",
  "bme688",
  "o2",
] as const

export type SensorName = (typeof SENSOR_NAMES)[number]

/** Bronkhorst flow controllers — reported as `flow_controller` samples and set
 *  via `flow.set` (not `sensor.rate`). */
export const FLOW_CHANNELS = ["flow1", "flow2"] as const

/** Firmware default scheduled polling rates, in Hz. */
export const DEFAULT_SENSOR_RATES_HZ: Record<SensorName, number> = {
  tc1: 10,
  tc2: 10,
  tc3: 10,
  tc4: 10,
  sht45: 2,
  bme688: 2,
  o2: 1,
}

/** A single sensor sample. Fields are a union across `kind`s; only the ones
 *  relevant to a given sample are present. */
export type FirmwareSample = {
  type: "sample"
  /** thermocouple | environment | analog | flow_controller | oxygen */
  kind: string
  sensor: string
  t_us: number
  /** Host receive timestamp in ms (Date.now, added on parse). */
  receivedAt: number
  /** Host performance.now() at receive — laptop monotonic clock for A/V sync. */
  perfRecvMs?: number
  /** MCU time mapped into the laptop performance.now() timeline
   *  (t_us/1000 + bestOffset). Use this to align samples with webcam frames. */
  syncedMs?: number
  ok?: boolean
  // temperature — thermocouples (tc1..tc4) AND environment sensors (sht45/bme688)
  temp_c?: number
  // thermocouple (tc1..tc4)
  cold_junction_c?: number
  fault?: number
  valid?: boolean
  // environment (sht45 / bme688)
  rh_pct?: number
  pressure_hpa?: number
  gas_kohm?: number
  // analog flow velocity (d6f_v03a1) — not emitted in the current build
  raw_adc?: number
  voltage_v?: number
  velocity_m_s?: number
  // flow controller (flow1 / flow2)
  raw?: number
  pct?: number
  // oxygen sensor (o2) — oxygen concentration by volume
  o2_vol_pct?: number
}

/** One entry in a `sensor.status` response. */
export type SensorStatusEntry = {
  name: string
  online: boolean
  rate_hz: number
}

/** A status / event / command-response message. Carries a union of fields
 *  across the status kinds; only the relevant ones are present on any line. */
export type FirmwareStatus = {
  type: "status"
  t_us?: number
  receivedAt: number
  /** Host performance.now() at receive. */
  perfRecvMs?: number
  /** MCU time in the laptop performance.now() timeline, when t_us is present. */
  syncedMs?: number
  component: string
  status: string
  detail?: string
  severity?: string
  // motor state (status "state" | "enabled" | "disabled", and stall completions)
  enabled?: boolean
  endstop_active?: boolean
  velocity_mode?: boolean
  position_steps?: number
  position_mm?: number
  home_source?: string
  // motor.driver_status — TMC2209 UART diagnostics
  connection_result?: number
  connection_ok?: boolean
  ifcnt?: number
  ioin?: number
  version?: number
  drv_status?: number
  rms_current_ma?: number
  microsteps?: number
  // motor.stall_status — StallGuard4 diagnostics
  sg_result?: number
  sg_threshold?: number
  effective_sg_threshold?: number
  tstep?: number
  tcoolthrs?: number
  tpwmthrs?: number
  diag_gpio?: number
  diag_pin?: boolean
  diag_interrupt_pending?: boolean
  stall_guard_armed?: boolean
  stall_test_active?: boolean
  stall_home_active?: boolean
  stall_home_backing_off?: boolean
  spreadcycle_enabled?: boolean
  stall_window_active?: boolean
  speed_mm_s?: number
  stall_test_travel_mm?: number
  stall_home_travel_mm?: number
  // i2c.scan
  addresses?: number[]
  count?: number
  // sensor.status
  sensors?: SensorStatusEntry[]
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

/**
 * Observed per-sensor sample rate in Hz, computed from a rolling sample log over
 * a recent window. Uses the MCU `t_us` clock for the cadence (robust to host
 * USB batching) and the host `receivedAt` only to bound the window. Sensors that
 * haven't sent at least two samples in the window are omitted.
 */
export function observedSampleRates(
  log: FirmwareSample[],
  windowMs = 15_000,
): Record<string, number> {
  if (log.length < 2) return {}
  const cutoff = log[log.length - 1].receivedAt - windowMs
  const bySensor = new Map<string, FirmwareSample[]>()
  // Walk newest-first and stop once outside the window (log is chronological).
  for (let i = log.length - 1; i >= 0; i--) {
    const sample = log[i]
    if (sample.receivedAt < cutoff) break
    const arr = bySensor.get(sample.sensor)
    if (arr) arr.push(sample)
    else bySensor.set(sample.sensor, [sample])
  }
  const rates: Record<string, number> = {}
  for (const [sensor, arr] of bySensor) {
    if (arr.length < 2) continue
    const spanUs = arr[0].t_us - arr[arr.length - 1].t_us
    if (spanUs > 0) rates[sensor] = ((arr.length - 1) / spanUs) * 1_000_000
  }
  return rates
}

/**
 * Extract the motor-state fields present on a status message, or null if it
 * carries none (e.g. `command_queued`, `json_error`). Different motor messages
 * report different subsets — a stall completion carries position but not
 * `enabled` — so callers should MERGE this onto the previously known state.
 */
export function motorStatePatch(
  status: FirmwareStatus,
): Partial<MotorState> | null {
  if (status.component !== "motor") return null
  const patch: Partial<MotorState> = {}
  if (typeof status.enabled === "boolean") patch.enabled = status.enabled
  if (typeof status.endstop_active === "boolean")
    patch.endstop_active = status.endstop_active
  if (typeof status.velocity_mode === "boolean")
    patch.velocity_mode = status.velocity_mode
  if (typeof status.position_steps === "number")
    patch.position_steps = status.position_steps
  if (typeof status.position_mm === "number")
    patch.position_mm = status.position_mm
  return Object.keys(patch).length > 0 ? patch : null
}

export function clampPct(value: number) {
  return Math.min(100, Math.max(0, value))
}

function clampInt(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Math.round(value)))
}

function clampNum(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, value))
}

const json = (payload: Record<string, unknown>) => JSON.stringify(payload)

// ---- Command builders (host -> board), one JSON object per line. ----
export const fw = {
  // Motor — motion
  motorStatus: () => json({ cmd: "motor.status" }),
  motorEnable: () => json({ cmd: "motor.enable" }),
  motorDisable: () => json({ cmd: "motor.disable" }),
  motorStop: () => json({ cmd: "motor.stop" }),
  motorHomeHere: () => json({ cmd: "motor.home_here" }),
  /** Absolute target in steps. The firmware clamps negative targets to 0. */
  motorMoveSteps: (steps: number) =>
    json({ cmd: "motor.move_steps", steps: Math.round(steps) }),
  /** Absolute target in mm. The firmware clamps negative targets to 0. */
  motorTargetMm: (mm: number) => json({ cmd: "motor.target_mm", mm }),
  /** Signed velocity in mm/s; the sign selects direction. */
  motorVelocity: (mm_s: number) => json({ cmd: "motor.velocity_mm_s", mm_s }),

  // Motor — TMC2209 driver & StallGuard4
  motorDriverStatus: () => json({ cmd: "motor.driver_status" }),
  motorDriverConfigure: () => json({ cmd: "motor.driver_configure" }),
  /** sgthrs 0..255, tcoolthrs 0..1048575 (0xFFFFF). Motor must be stopped. */
  motorStallConfig: (sgthrs: number, tcoolthrs: number) =>
    json({
      cmd: "motor.stall_config",
      sgthrs: clampInt(sgthrs, 0, 255),
      tcoolthrs: clampInt(tcoolthrs, 0, 1048575),
    }),
  motorStallStatus: () => json({ cmd: "motor.stall_status" }),
  /** Bounded StallGuard test: mm_s nonzero in -8..8, max_travel_mm <= 10. */
  motorStallTest: (mm_s: number, max_travel_mm: number) =>
    json({
      cmd: "motor.stall_test",
      mm_s: clampNum(mm_s, -8, 8),
      max_travel_mm: clampNum(max_travel_mm, 0, 10),
    }),
  /** Bounded sensorless homing: max_travel_mm <= 100. */
  motorStallHome: (max_travel_mm: number) =>
    json({
      cmd: "motor.stall_home",
      max_travel_mm: clampNum(max_travel_mm, 0, 100),
    }),

  // Flow controllers
  /** channel 1 or 2 (defaults to 1); pct is clamped to 0..100. */
  flowSet: (channel: number, pct: number) =>
    json({ cmd: "flow.set", channel: channel === 2 ? 2 : 1, pct: clampPct(pct) }),

  // Sensors & bus
  sensorStatus: () => json({ cmd: "sensor.status" }),
  /** hz integer >= 0; 0 disables scheduled reads for that sensor. */
  sensorRate: (sensor: string, hz: number) =>
    json({ cmd: "sensor.rate", sensor, hz: Math.max(0, Math.round(hz)) }),
  i2cScan: () => json({ cmd: "i2c.scan" }),
}
