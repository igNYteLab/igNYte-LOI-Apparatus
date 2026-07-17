import type { FirmwareSample } from "@/lib/firmware"

export type TestArchiveMeta = {
  name: string
  runId?: string
  psetId?: string
  startedAt: string
  startedAtLocal?: string
  stoppedAt: string
  stoppedAtLocal?: string
  durationSeconds: number
  sampleCount: number
  frameExportFps?: number
  frameCount?: number
  operator?: string
  sample?: string
  notes?: string
  videoFile: string | null
  videoError: string | null
  framesDirectory?: string
}

export type TestArchiveEntry = {
  id: string
  meta: TestArchiveMeta
  /** Raw per-sensor samples captured during the session, oldest first. */
  samples: FirmwareSample[]
}

export const TEST_ARCHIVE_STORAGE_KEY = "ignyte.testArchive"
export const TEST_ARCHIVE_CHANGED_EVENT = "ignyte:testArchiveChanged"

export function sanitizeArchiveName(name: string) {
  const safe = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return safe || "loi_test"
}

export function formatElapsed(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function readTestArchive() {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(TEST_ARCHIVE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isArchiveEntry)
  } catch {
    return []
  }
}

export function writeTestArchive(entries: TestArchiveEntry[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(TEST_ARCHIVE_STORAGE_KEY, JSON.stringify(entries))
  window.dispatchEvent(new Event(TEST_ARCHIVE_CHANGED_EVENT))
}

export function appendTestArchive(entry: TestArchiveEntry) {
  const entries = readTestArchive()
  writeTestArchive([entry, ...entries])
}

export function deleteTestArchive(id: string) {
  writeTestArchive(readTestArchive().filter((entry) => entry.id !== id))
}

export function downloadTextFile(filename: string, content: string) {
  downloadBlobFile(filename, new Blob([content], { type: "application/json" }))
}

export function downloadBlobFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoke after a delay rather than synchronously: revoking immediately can
  // cancel the download of a larger blob (e.g. session video) before the
  // browser has finished reading it.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

function isArchiveEntry(value: unknown): value is TestArchiveEntry {
  if (!value || typeof value !== "object") return false
  const entry = value as Partial<TestArchiveEntry>
  if (typeof entry.id !== "string") return false
  if (!entry.meta || typeof entry.meta !== "object") return false
  if (!Array.isArray(entry.samples)) return false
  const meta = entry.meta as Partial<TestArchiveMeta>
  return (
    typeof meta.name === "string" &&
    typeof meta.startedAt === "string" &&
    typeof meta.stoppedAt === "string" &&
    typeof meta.durationSeconds === "number" &&
    typeof meta.sampleCount === "number"
  )
}
