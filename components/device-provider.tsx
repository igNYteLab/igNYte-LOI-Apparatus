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
  parseFirmwareLine,
  type FirmwareSample,
  type MotorState,
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

export type BootState = { status: string; ready: boolean; severity?: string }

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

  const portRef = useRef<SerialPort | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const readLoopRef = useRef<Promise<void> | null>(null)
  const keepReadingRef = useRef(false)

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
        const newSamples: FirmwareSample[] = []
        let nextMotor: MotorState | null = null
        let nextBoot: BootState | null = null

        for (const part of complete) {
          const parsed = parseFirmwareLine(part, receivedAt)
          if (parsed.kind === "sample") {
            newSamples.push(parsed.sample)
          } else if (parsed.kind === "status") {
            const s = parsed.status
            if (
              s.component === "motor" &&
              (s.status === "state" || typeof s.enabled === "boolean")
            ) {
              nextMotor = {
                enabled: s.enabled ?? false,
                endstop_active: s.endstop_active ?? false,
                velocity_mode: s.velocity_mode ?? false,
                position_steps: s.position_steps ?? 0,
                position_mm: s.position_mm ?? 0,
                updatedAt: receivedAt,
              }
            }
            if (s.component === "boot") {
              nextBoot = {
                status: s.status,
                ready: isBootReady(s),
                severity: s.severity,
              }
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
        if (nextMotor) setMotor(nextMotor)
        if (nextBoot) setBoot(nextBoot)
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
