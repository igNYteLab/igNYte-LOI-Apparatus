// Primary author: Will Andre Pasimio Llaneta (wpl5304)
// Project: IgNYte-FPA
// Context: NYU Tandon IgNYte Lab fire propagation apparatus internship work.

const BAUD_RATE = 115200
const MAX_LOG_LINES = 120

export async function connectSerial() {
  const port = await navigator.serial.requestPort()
  await port.open({ baudRate: BAUD_RATE })
  return port
}

export async function sendSerialCommand(port, command) {
  if (!port?.writable) {
    throw new Error("Serial port is not connected")
  }

  const writer = port.writable.getWriter()
  try {
    await writer.write(new TextEncoder().encode(`${command}\n`))
  } finally {
    writer.releaseLock()
  }
}

export const firmwareCommands = {
  motorStatus: () => JSON.stringify({ cmd: "motor.status" }),
  driverStatus: () => JSON.stringify({ cmd: "motor.driver_status" }),
  motorEnable: () => JSON.stringify({ cmd: "motor.enable" }),
  motorStop: () => JSON.stringify({ cmd: "motor.stop" }),
  motorDisable: () => JSON.stringify({ cmd: "motor.disable" }),
  motorVelocityMmS: (mmS) =>
    JSON.stringify({ cmd: "motor.velocity_mm_s", mm_s: mmS }),
  motorCalibrateAxis: () => JSON.stringify({ cmd: "motor.calibrate_axis" }),
}

export function buildSerialCommandMessage(recommendation) {
  if (!recommendation) {
    return firmwareCommands.motorVelocityMmS(0) // Stop the motor if no recommendation is available. Motor.stop is not used because Accelstepper::stop() is controlled deceleration not an immediate stop.
  }

  if (recommendation.mode === "velocity_mm_s") {
    return firmwareCommands.motorVelocityMmS(recommendation.velocity_mm_s)
  }

  throw new Error(`Unsupported recommendation mode: ${recommendation.mode}`)
}

export function createSerialController(callbacks = {}) {
  let port = null
  let reader = null
  let readActive = false
  let lines = []

  async function connect() {
    if (!("serial" in navigator)) {
      setStatus("Serial unsupported", "bad")
      appendLine("Web Serial is not available. Use Chrome or Edge.")
      return
    }

    try {
      port = await connectSerial()
      lines = []
      setConnected(true)
      setStatus("Serial connected", "good")
      appendLine("serial connected")
      startReadLoop()
    } catch (err) {
      setStatus("Serial failed", "bad")
      appendLine(err instanceof Error ? err.message : String(err))
      port = null
      setConnected(false)
    }
  }

  async function disconnect() {
    readActive = false
    try {
      await reader?.cancel()
    } catch {
      // Ignore cancellation failures during disconnect.
    }
    reader = null

    try {
      await port?.close()
    } catch (err) {
      appendLine(
        `serial close failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    port = null
    setConnected(false)
    setStatus("Serial disconnected", "muted")
    appendLine("serial disconnected")
  }

  async function sendCommand(command) {
    if (!port) {
      appendLine("serial is not connected")
      return
    }

    try {
      await sendSerialCommand(port, command)
      callbacks.onLastCommand?.(command)
      appendLine(`> ${command}`)
    } catch (err) {
      appendLine(
        `serial write failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  async function sendCurrentRecommendation(tracking, recommendation) {
    const command = buildSerialCommandMessage(
      tracking?.tracking && tracking.confidence >= 0.5 ? recommendation : null,
    )
    await sendCommand(command)
  }

  function startReadLoop() {
    if (!port?.readable) {
      appendLine("serial port is not readable")
      return
    }

    readActive = true
    const decoder = new TextDecoder()
    let buffer = ""

    void (async () => {
      const activeReader = port.readable.getReader()
      reader = activeReader
      try {
        while (readActive) {
          const { value, done } = await activeReader.read()
          if (done) break
          if (!value) continue
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split(/\r?\n/)
          buffer = parts.pop() ?? ""
          for (const part of parts) {
            const line = part.trim()
            if (line) appendLine(`< ${line}`)
          }
        }
      } catch (err) {
        if (readActive) {
          appendLine(
            `serial read failed: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      } finally {
        try {
          activeReader.releaseLock()
        } catch {
          // Ignore release failures during teardown.
        }
        if (reader === activeReader) reader = null
      }
    })()
  }

  function setConnected(connected) {
    callbacks.onConnectedChange?.(connected)
  }

  function setStatus(text, tone) {
    callbacks.onStatus?.(text, tone)
  }

  function appendLine(line) {
    lines.push(line)
    if (lines.length > MAX_LOG_LINES) {
      lines = lines.slice(-MAX_LOG_LINES)
    }
    callbacks.onLog?.(lines.join("\n"))
  }

  return {
    connect,
    disconnect,
    appendLine,
    sendCommand,
    sendCurrentRecommendation,
  }
}
