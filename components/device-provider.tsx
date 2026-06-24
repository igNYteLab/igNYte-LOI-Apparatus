"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

import {
  BAUD_RATE,
  isBootReady,
  motorStatePatch,
  parseFirmwareLine,
  type FirmwareSample,
  type FirmwareStatus,
  type MotorState,
  type SensorStatusEntry,
} from "@/lib/firmware"

export type DeviceStatus =
  | "unsupported"
  | "disconnected"
  | "connecting"
  | "connected"

const MAX_LINES = 200
// Rolling sample log kept in memory for charts and session recording. Bounds
// memory; sessions longer than this many samples lose their earliest points.
const MAX_LOG = 10_000

// Host↔MCU clock sync. During the first SYNC_WINDOW_MS of samples we collect
// (perfNow − t_us/1000) offsets; the MINIMUM offset is the least-delayed sample
// and best approximates the true clock offset. After the window we lock it and
// stamp every message's syncedMs = t_us/1000 + bestOffset, in the laptop
// performance.now() timeline (for webcam / A-V correlation).
const SYNC_WINDOW_MS = 3000

export type BootState = { status: string; ready: boolean; severity?: string }

/** Host↔MCU clock-sync state for webcam/data correlation. `offsetMs` is the
 *  best (minimum) clock offset seen so far; `calibrated` is true once the
 *  initial window has elapsed and the offset is locked. */
export type ClockSync = { calibrated: boolean; offsetMs: number | null }

type DeviceContextValue = {
  supported: boolean
  status: DeviceStatus
  error: string | null
  /** Recent raw serial lines, including non-JSON boot/debug text. */
  lines: string[]
  /** Latest sample per sensor, keyed by sensor name. */
  samples: Record<string, FirmwareSample>
  /** Rolling window of recent samples (oldest first) for charts/recording. */
  log: FirmwareSample[]
  /** Latest known motor state, or null until a state message arrives. */
  motor: MotorState | null
  /** Latest boot status, or null until the board reports one. */
  boot: BootState | null
  /** Latest `motor.driver_status` (TMC2209 UART) response, or null. */
  driver: FirmwareStatus | null
  /** Latest `motor.stall_status` (StallGuard4) response, or null. */
  stall: FirmwareStatus | null
  /** Latest `sensor.status` sensor list, or null. */
  sensorStatuses: SensorStatusEntry[] | null
  /** Latest `i2c.scan` result, or null. */
  i2c: { addresses: number[]; count: number } | null
  /** Host↔MCU clock-sync state (laptop performance.now() timeline). */
  sync: ClockSync
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  /** Send a JSON command string to the board (newline appended). */
  sendCommand: (command: string) => Promise<void>
}

const DeviceContext = createContext<DeviceContextValue | null>(null)

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [supported, setSupported] = useState(false)
  const [status, setStatus] = useState<DeviceStatus>("disconnected")
  const [error, setError] = useState<string | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const [samples, setSamples] = useState<Record<string, FirmwareSample>>({})
  const [log, setLog] = useState<FirmwareSample[]>([])
  const [motor, setMotor] = useState<MotorState | null>(null)
  const [boot, setBoot] = useState<BootState | null>(null)
  const [driver, setDriver] = useState<FirmwareStatus | null>(null)
  const [stall, setStall] = useState<FirmwareStatus | null>(null)
  const [sensorStatuses, setSensorStatuses] = useState<
    SensorStatusEntry[] | null
  >(null)
  const [i2c, setI2c] = useState<{ addresses: number[]; count: number } | null>(
    null,
  )
  const [syncCalibrated, setSyncCalibrated] = useState(false)
  const [syncOffsetMs, setSyncOffsetMs] = useState<number | null>(null)

  const portRef = useRef<SerialPort | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const readLoopRef = useRef<Promise<void> | null>(null)
  const keepReadingRef = useRef(false)
  // Clock-sync calibration (mutated per message; mirrored to state for the UI).
  const syncStartRef = useRef<number | null>(null)
  const syncBestOffsetRef = useRef<number | null>(null)
  const syncCalibratedRef = useRef(false)

  useEffect(() => {
    const ok = typeof navigator !== "undefined" && "serial" in navigator
    const handle = window.setTimeout(() => {
      setSupported(ok)
      setStatus(ok ? "disconnected" : "unsupported")
    }, 0)
    return () => window.clearTimeout(handle)
  }, [])

  const resetState = useCallback(() => {
    setLines([])
    setSamples({})
    setLog([])
    setMotor(null)
    setBoot(null)
    setDriver(null)
    setStall(null)
    setSensorStatuses(null)
    setI2c(null)
    syncStartRef.current = null
    syncBestOffsetRef.current = null
    syncCalibratedRef.current = false
    setSyncCalibrated(false)
    setSyncOffsetMs(null)
  }, [])

  const readLoop = useCallback(async () => {
    const reader = readerRef.current
    if (!reader) return
    const decoder = new TextDecoder()
    let buffer = ""
    try {
      while (keepReadingRef.current) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split(/\r?\n/)
        buffer = parts.pop() ?? ""
        const complete = parts
          .map((part) => part.trim())
          .filter((part) => part.length > 0)
        if (!complete.length) continue

        const receivedAt = Date.now()
        const perfNow = performance.now()
        const newSamples: FirmwareSample[] = []
        let motorPatch: Partial<MotorState> | null = null
        let nextBoot: BootState | null = null
        let nextDriver: FirmwareStatus | null = null
        let nextStall: FirmwareStatus | null = null
        let nextSensors: SensorStatusEntry[] | null = null
        let nextI2c: { addresses: number[]; count: number } | null = null

        for (const part of complete) {
          const parsed = parseFirmwareLine(part, receivedAt)
          if (parsed.kind === "sample") {
            const sample = parsed.sample
            const tMcuMs = sample.t_us / 1000
            const offset = perfNow - tMcuMs
            // Calibrate during the initial window: keep the running minimum
            // offset (least-delayed sample ≈ true clock offset), then lock it.
            if (!syncCalibratedRef.current) {
              if (
                syncBestOffsetRef.current === null ||
                offset < syncBestOffsetRef.current
              ) {
                syncBestOffsetRef.current = offset
              }
              if (syncStartRef.current === null) syncStartRef.current = perfNow
              if (perfNow - syncStartRef.current >= SYNC_WINDOW_MS) {
                syncCalibratedRef.current = true
              }
            }
            const bestOffset = syncBestOffsetRef.current ?? offset
            sample.perfRecvMs = perfNow
            sample.syncedMs = tMcuMs + bestOffset
            newSamples.push(sample)
            continue
          }
          if (parsed.kind !== "status") continue
          const s = parsed.status
          s.perfRecvMs = perfNow
          if (typeof s.t_us === "number" && syncBestOffsetRef.current !== null) {
            s.syncedMs = s.t_us / 1000 + syncBestOffsetRef.current
          }

          // Motor state arrives in different shapes (state/enabled/disabled and
          // stall completions that carry only position). Merge whichever fields
          // each message actually reports onto the running state.
          const patch = motorStatePatch(s)
          if (patch) motorPatch = { ...(motorPatch ?? {}), ...patch }

          if (s.component === "boot") {
            nextBoot = {
              status: s.status,
              ready: isBootReady(s),
              severity: s.severity,
            }
          }
          if (s.component === "motor" && s.status === "driver_status") {
            nextDriver = s
          }
          if (s.component === "motor" && s.status === "stall_status") {
            nextStall = s
          }
          if (s.component === "sensor" && Array.isArray(s.sensors)) {
            nextSensors = s.sensors
          }
          if (s.component === "i2c" && Array.isArray(s.addresses)) {
            nextI2c = {
              addresses: s.addresses,
              count: typeof s.count === "number" ? s.count : s.addresses.length,
            }
          }
        }

        setLines((prev) => {
          const next = [...prev, ...complete]
          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
        })
        if (newSamples.length) {
          setSamples((prev) => {
            const next = { ...prev }
            for (const sample of newSamples) next[sample.sensor] = sample
            return next
          })
          setLog((prev) => {
            const next = [...prev, ...newSamples]
            return next.length > MAX_LOG ? next.slice(-MAX_LOG) : next
          })
        }
        if (motorPatch) {
          const patch = motorPatch
          setMotor((prev) => ({
            enabled: patch.enabled ?? prev?.enabled ?? false,
            endstop_active: patch.endstop_active ?? prev?.endstop_active ?? false,
            velocity_mode: patch.velocity_mode ?? prev?.velocity_mode ?? false,
            position_steps: patch.position_steps ?? prev?.position_steps ?? 0,
            position_mm: patch.position_mm ?? prev?.position_mm ?? 0,
            updatedAt: receivedAt,
          }))
        }
        if (nextBoot) setBoot(nextBoot)
        if (nextDriver) setDriver(nextDriver)
        if (nextStall) setStall(nextStall)
        if (nextSensors) setSensorStatuses(nextSensors)
        if (nextI2c) setI2c(nextI2c)
        if (newSamples.length) {
          // Mirror calibration to state for the UI (same value → no re-render).
          setSyncOffsetMs(syncBestOffsetRef.current)
          setSyncCalibrated(syncCalibratedRef.current)
        }
      }
    } catch (err) {
      if (keepReadingRef.current) {
        setError(err instanceof Error ? err.message : "Serial read error")
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // ignore
      }
    }
  }, [])

  const teardown = useCallback(async () => {
    keepReadingRef.current = false
    try {
      await readerRef.current?.cancel()
    } catch {
      // ignore
    }
    try {
      await readLoopRef.current
    } catch {
      // ignore
    }
    readLoopRef.current = null
    readerRef.current = null
    try {
      await portRef.current?.close()
    } catch {
      // ignore
    }
    portRef.current = null
  }, [])

  const disconnect = useCallback(async () => {
    await teardown()
    resetState()
    setStatus((prev) => (prev === "unsupported" ? prev : "disconnected"))
  }, [teardown, resetState])

  const connect = useCallback(async () => {
    if (!(typeof navigator !== "undefined" && "serial" in navigator)) {
      setStatus("unsupported")
      return
    }
    setError(null)
    setStatus("connecting")
    try {
      const port = await navigator.serial.requestPort()
      await port.open({ baudRate: BAUD_RATE })
      if (!port.readable) {
        throw new Error("Serial port is not readable")
      }
      portRef.current = port
      readerRef.current = port.readable.getReader()
      keepReadingRef.current = true
      resetState()
      setStatus("connected")
      readLoopRef.current = readLoop()
    } catch (err) {
      // Ignore the user dismissing the port picker; surface real failures.
      if (!(err instanceof DOMException && err.name === "NotFoundError")) {
        setError(err instanceof Error ? err.message : "Failed to connect")
      }
      await teardown()
      setStatus("disconnected")
    }
  }, [readLoop, teardown, resetState])

  const sendCommand = useCallback(async (command: string) => {
    const port = portRef.current
    if (!port?.writable) throw new Error("Board is not connected.")
    const writer = port.writable.getWriter()
    try {
      await writer.write(new TextEncoder().encode(`${command}\n`))
    } finally {
      writer.releaseLock()
    }
  }, [])

  useEffect(() => {
    return () => {
      keepReadingRef.current = false
      readerRef.current?.cancel().catch(() => {})
      portRef.current?.close().catch(() => {})
    }
  }, [])

  return (
    <DeviceContext.Provider
      value={{
        supported,
        status,
        error,
        lines,
        samples,
        log,
        motor,
        boot,
        driver,
        stall,
        sensorStatuses,
        i2c,
        sync: { calibrated: syncCalibrated, offsetMs: syncOffsetMs },
        connect,
        disconnect,
        sendCommand,
      }}
    >
      {children}
    </DeviceContext.Provider>
  )
}

export function useDevice() {
  const context = useContext(DeviceContext)
  if (!context) {
    throw new Error("useDevice must be used within a <DeviceProvider>")
  }
  return context
}
