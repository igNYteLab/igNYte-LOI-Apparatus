// =============================================================================
// Ignyte LOI Test Bench — localStorage implementation of db/schema.sql
// =============================================================================
// A typed, browser-local stand-in for the Postgres schema in db/schema.sql.
// Stores ONLY the numerical values relating to testing a sample:
//   sample · test_run · sensor_channel (seeded) · sensor_reading (time series)
//
// Each "table" is a JSON array under its own key; sensor readings are kept in a
// per-run key so a single run's series can be loaded/cleared without touching
// the rest. IDs auto-increment like BIGSERIAL via a persisted sequence.
//
// NOTE: localStorage is ~5 MB. High-rate captures should move to the real
// Postgres schema; helpers here mirror that schema so the swap is mechanical.
// =============================================================================

import type { FirmwareSample } from "@/lib/firmware"

// ---- Types (mirror db/schema.sql) -------------------------------------------

export type Sample = {
  id: number
  externalId: string | null
  material: string | null
  lengthMm: number | null
  widthMm: number | null
  thicknessMm: number | null
  massG: number | null
  createdAt: string // ISO-8601
}

export type TestRun = {
  id: number
  sampleId: number
  externalTestId: string | null
  psetId: string | null
  startedAt: string
  stoppedAt: string | null
  durationSeconds: number | null
  sampleCount: number
  oxygenIndexPct: number | null
  o2SetpointPct: number | null
  n2SetpointPct: number | null
  ambientTempC: number | null
  ambientRhPct: number | null
  ambientPressureHpa: number | null
  createdAt: string
}

export type SensorChannel = {
  id: number
  key: string // tc1..tc4, sht45, bme688, o2, d6f_v03a1, flow1, flow2
  kind: string // thermocouple | environment | oxygen | analog | flow_controller
  unit: string // degC | %RH | hPa | kOhm | m/s | %
}

export type SensorReading = {
  id: number
  testRunId: number
  channelId: number
  deviceTUs: number | null
  recordedAt: string
  ok: boolean | null
  // thermocouple
  tempC: number | null
  coldJunctionC: number | null
  fault: number | null
  // environment
  rhPct: number | null
  pressureHpa: number | null
  gasKohm: number | null
  // oxygen
  o2VolPct: number | null
  // analog velocity
  rawAdc: number | null
  voltageV: number | null
  velocityMs: number | null
  // flow controller
  raw: number | null
  pct: number | null
}

// ---- Storage plumbing -------------------------------------------------------

const NS = "ignyte.db"
const KEYS = {
  samples: `${NS}.samples`,
  runs: `${NS}.testRuns`,
  channels: `${NS}.sensorChannels`,
  seq: `${NS}.seq`,
  readings: (runId: number) => `${NS}.readings.${runId}`,
}

/** Dispatched on any write so the UI can refresh (mirrors the archive event). */
export const LOCAL_DB_CHANGED_EVENT = "ignyte:localDbChanged"

type Sequence = { sample: number; testRun: number; sensorReading: number }

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage
}

function read<T>(key: string, fallback: T): T {
  if (!hasStorage()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T): void {
  if (!hasStorage()) return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    window.dispatchEvent(new Event(LOCAL_DB_CHANGED_EVENT))
  } catch {
    // Ignore quota / serialization failures.
  }
}

function nextId(table: keyof Sequence): number {
  const seq = read<Sequence>(KEYS.seq, {
    sample: 0,
    testRun: 0,
    sensorReading: 0,
  })
  const id = (seq[table] ?? 0) + 1
  write(KEYS.seq, { ...seq, [table]: id })
  return id
}

// ---- sensor_channel (seeded lookup) -----------------------------------------

const DEFAULT_CHANNELS: Omit<SensorChannel, "id">[] = [
  { key: "tc1", kind: "thermocouple", unit: "degC" },
  { key: "tc2", kind: "thermocouple", unit: "degC" },
  { key: "tc3", kind: "thermocouple", unit: "degC" },
  { key: "tc4", kind: "thermocouple", unit: "degC" },
  { key: "sht45", kind: "environment", unit: "%RH" },
  { key: "bme688", kind: "environment", unit: "hPa" },
  { key: "o2", kind: "oxygen", unit: "%" },
  { key: "d6f_v03a1", kind: "analog", unit: "m/s" },
  { key: "flow1", kind: "flow_controller", unit: "%" },
  { key: "flow2", kind: "flow_controller", unit: "%" },
]

export function listChannels(): SensorChannel[] {
  const existing = read<SensorChannel[]>(KEYS.channels, [])
  if (existing.length) return existing
  const seeded = DEFAULT_CHANNELS.map((c, i) => ({ id: i + 1, ...c }))
  write(KEYS.channels, seeded)
  return seeded
}

export function channelIdForKey(key: string): number | null {
  return listChannels().find((c) => c.key === key)?.id ?? null
}

// ---- sample -----------------------------------------------------------------

export type NewSample = Partial<Omit<Sample, "id" | "createdAt">>

export function createSample(input: NewSample = {}): Sample {
  const sample: Sample = {
    id: nextId("sample"),
    externalId: input.externalId ?? null,
    material: input.material ?? null,
    lengthMm: input.lengthMm ?? null,
    widthMm: input.widthMm ?? null,
    thicknessMm: input.thicknessMm ?? null,
    massG: input.massG ?? null,
    createdAt: new Date().toISOString(),
  }
  write(KEYS.samples, [...listSamples(), sample])
  return sample
}

export function listSamples(): Sample[] {
  return read<Sample[]>(KEYS.samples, [])
}

export function getSample(id: number): Sample | undefined {
  return listSamples().find((s) => s.id === id)
}

// ---- test_run ---------------------------------------------------------------

export type NewTestRun = Partial<
  Omit<TestRun, "id" | "sampleId" | "createdAt" | "sampleCount">
> & { sampleId: number; startedAt: string; sampleCount?: number }

export function createTestRun(input: NewTestRun): TestRun {
  const run: TestRun = {
    id: nextId("testRun"),
    sampleId: input.sampleId,
    externalTestId: input.externalTestId ?? null,
    psetId: input.psetId ?? null,
    startedAt: input.startedAt,
    stoppedAt: input.stoppedAt ?? null,
    durationSeconds: input.durationSeconds ?? null,
    sampleCount: input.sampleCount ?? 0,
    oxygenIndexPct: input.oxygenIndexPct ?? null,
    o2SetpointPct: input.o2SetpointPct ?? null,
    n2SetpointPct: input.n2SetpointPct ?? null,
    ambientTempC: input.ambientTempC ?? null,
    ambientRhPct: input.ambientRhPct ?? null,
    ambientPressureHpa: input.ambientPressureHpa ?? null,
    createdAt: new Date().toISOString(),
  }
  write(KEYS.runs, [...listTestRuns(), run])
  return run
}

export function listTestRuns(sampleId?: number): TestRun[] {
  const runs = read<TestRun[]>(KEYS.runs, [])
  return sampleId == null ? runs : runs.filter((r) => r.sampleId === sampleId)
}

export function getTestRun(id: number): TestRun | undefined {
  return listTestRuns().find((r) => r.id === id)
}

export function updateTestRun(
  id: number,
  patch: Partial<Omit<TestRun, "id">>
): TestRun | null {
  const runs = listTestRuns()
  const index = runs.findIndex((r) => r.id === id)
  if (index === -1) return null
  const updated = { ...runs[index], ...patch, id }
  runs[index] = updated
  write(KEYS.runs, runs)
  return updated
}

// ---- sensor_reading (time series) -------------------------------------------

/** Map a raw firmware sample onto a sensor_reading row for the given run. */
function toReading(
  testRunId: number,
  sample: FirmwareSample
): SensorReading | null {
  const channelId = channelIdForKey(sample.sensor)
  if (channelId == null) return null
  return {
    id: nextId("sensorReading"),
    testRunId,
    channelId,
    deviceTUs: sample.t_us ?? null,
    recordedAt: new Date(sample.receivedAt).toISOString(),
    ok: sample.ok ?? sample.valid ?? null,
    tempC: sample.temp_c ?? null,
    coldJunctionC: sample.cold_junction_c ?? null,
    fault: sample.fault ?? null,
    rhPct: sample.rh_pct ?? null,
    pressureHpa: sample.pressure_hpa ?? null,
    gasKohm: sample.gas_kohm ?? null,
    o2VolPct: sample.o2_vol_pct ?? null,
    rawAdc: sample.raw_adc ?? null,
    voltageV: sample.voltage_v ?? null,
    velocityMs: sample.velocity_m_s ?? null,
    raw: sample.raw ?? null,
    pct: sample.pct ?? null,
  }
}

/** Append firmware samples to a run's reading series. Returns rows written. */
export function addReadings(
  testRunId: number,
  samples: FirmwareSample[]
): number {
  if (!samples.length) return 0
  const rows = samples
    .map((s) => toReading(testRunId, s))
    .filter((r): r is SensorReading => r !== null)
  if (!rows.length) return 0
  write(KEYS.readings(testRunId), [...getReadings(testRunId), ...rows])
  return rows.length
}

export function getReadings(testRunId: number): SensorReading[] {
  return read<SensorReading[]>(KEYS.readings(testRunId), [])
}

/** Delete a run and its readings. */
export function deleteTestRun(testRunId: number): void {
  write(
    KEYS.runs,
    listTestRuns().filter((r) => r.id !== testRunId)
  )
  if (hasStorage()) window.localStorage.removeItem(KEYS.readings(testRunId))
  if (hasStorage()) window.dispatchEvent(new Event(LOCAL_DB_CHANGED_EVENT))
}

// ---- High-level convenience -------------------------------------------------

export type RecordTestInput = {
  sample?: NewSample
  run?: Omit<NewTestRun, "sampleId">
  samples: FirmwareSample[]
}

/**
 * Persist a completed test in one call: create the sample + test_run, ingest
 * every numerical sample as a sensor_reading, and backfill the run's
 * sample_count and ambient conditions (from the latest environment reading).
 */
export function recordCompletedTest(input: RecordTestInput): {
  sample: Sample
  run: TestRun
  readingCount: number
} {
  const sample = createSample(input.sample)
  const run = createTestRun({
    startedAt: new Date().toISOString(),
    ...input.run,
    sampleId: sample.id,
  })
  const readingCount = addReadings(run.id, input.samples)

  // Backfill ambient conditions from the most recent environment sample.
  const env = [...input.samples].reverse().find((s) => s.kind === "environment")
  const updated = updateTestRun(run.id, {
    sampleCount: readingCount,
    ambientTempC: env?.temp_c ?? run.ambientTempC,
    ambientRhPct: env?.rh_pct ?? run.ambientRhPct,
    ambientPressureHpa: env?.pressure_hpa ?? run.ambientPressureHpa,
  })

  return { sample, run: updated ?? run, readingCount }
}

/** Full nested export of a run (sample + run + readings), e.g. for download. */
export function exportTestRun(testRunId: number): {
  sample: Sample | undefined
  run: TestRun
  readings: SensorReading[]
} | null {
  const run = getTestRun(testRunId)
  if (!run) return null
  return {
    sample: getSample(run.sampleId),
    run,
    readings: getReadings(testRunId),
  }
}

/** Wipe every local-DB key (samples, runs, channels, sequences, readings). */
export function clearLocalDb(): void {
  if (!hasStorage()) return
  const toRemove: string[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (key && key.startsWith(`${NS}.`)) toRemove.push(key)
  }
  toRemove.forEach((key) => window.localStorage.removeItem(key))
  window.dispatchEvent(new Event(LOCAL_DB_CHANGED_EVENT))
}
