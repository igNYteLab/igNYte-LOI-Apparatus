"use client"

import { useCallback, useRef, useState } from "react"

import type {
  VisionDetectResult,
  VisionRuntime,
} from "@/lib/vision/opencv-types"

const WORKER_SRC = "/vendor/opencv/vision-worker.js"
const LOAD_TIMEOUT_MS = 30000
const DETECT_TIMEOUT_MS = 5000

type WorkerStage =
  | "starting-worker"
  | "importing-worker-script"
  | "initializing-runtime"
  | "ready"

type WorkerMessage =
  | { type: "stage"; stage: WorkerStage }
  | { type: "ready" }
  | { type: "error"; error: string }
  | {
      type: "detected"
      id: number
      detection: VisionDetectResult["detection"]
      mask: ImageData | null
    }
  | { type: "detect-error"; id: number; error: string }

type OpenCvWindow = Window & {
  __visionRuntime?: VisionRuntime
  __opencvPromise?: Promise<VisionRuntime>
}

class VisionWorkerRuntime implements VisionRuntime {
  private nextId = 1
  private readonly pending = new Map<
    number,
    {
      resolve: (result: VisionDetectResult) => void
      reject: (error: Error) => void
      timeoutId: number
    }
  >()

  constructor(private readonly worker: Worker) {
    this.worker.addEventListener("message", this.handleMessage)
    this.worker.addEventListener("error", this.handleWorkerError)
  }

  detect(
    imageData: ImageData,
    options: Parameters<VisionRuntime["detect"]>[1],
    includeMask: boolean,
  ) {
    const id = this.nextId++
    return new Promise<VisionDetectResult>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pending.delete(id)
        reject(new Error("Vision worker detection timed out."))
      }, DETECT_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timeoutId })
      this.worker.postMessage(
        { type: "detect", id, imageData, options, includeMask },
        [imageData.data.buffer as ArrayBuffer],
      )
    })
  }

  dispose() {
    this.worker.removeEventListener("message", this.handleMessage)
    this.worker.removeEventListener("error", this.handleWorkerError)
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timeoutId)
      pending.reject(new Error("Vision worker was disposed."))
    }
    this.pending.clear()
    this.worker.terminate()
  }

  private readonly handleMessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data
    if (message.type !== "detected" && message.type !== "detect-error") return
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    window.clearTimeout(pending.timeoutId)
    if (message.type === "detected") {
      pending.resolve({ detection: message.detection, mask: message.mask })
    } else {
      pending.reject(new Error(message.error))
    }
  }

  private readonly handleWorkerError = (event: ErrorEvent) => {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id)
      window.clearTimeout(pending.timeoutId)
      pending.reject(new Error(event.message || "Vision worker failed."))
    }
  }
}

function loadOpenCv(onStage?: (stage: WorkerStage) => void): Promise<VisionRuntime> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV.js requires a browser"))
  }
  const w = window as OpenCvWindow
  if (w.__visionRuntime) return Promise.resolve(w.__visionRuntime)
  if (w.__opencvPromise) return w.__opencvPromise

  const attempt = new Promise<VisionRuntime>((resolve, reject) => {
    let settled = false
    let worker: Worker | null = null
    const timeoutId = window.setTimeout(() => {
      fail("OpenCV.js did not initialize in the vision worker within 30 seconds.")
    }, LOAD_TIMEOUT_MS)

    const cleanUpListeners = () => {
      if (!worker) return
      worker.removeEventListener("message", handleMessage)
      worker.removeEventListener("error", handleWorkerError)
    }

    const succeed = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      cleanUpListeners()
      onStage?.("ready")
      const runtime = new VisionWorkerRuntime(worker!)
      w.__visionRuntime = runtime
      resolve(runtime)
    }

    const fail = (message: string) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      cleanUpListeners()
      worker?.terminate()
      reject(new Error(message))
    }

    function handleMessage(event: MessageEvent<WorkerMessage>) {
      const message = event.data
      if (message.type === "stage") {
        onStage?.(message.stage)
      } else if (message.type === "ready") {
        succeed()
      } else if (message.type === "error") {
        fail(message.error)
      }
    }

    function handleWorkerError(event: ErrorEvent) {
      fail(
        event.message ||
          `Failed to load ${WORKER_SRC}. Confirm the vision worker is included in the deployment.`,
      )
    }

    try {
      onStage?.("starting-worker")
      worker = new Worker(WORKER_SRC)
      worker.addEventListener("message", handleMessage)
      worker.addEventListener("error", handleWorkerError)
    } catch (error) {
      fail(error instanceof Error ? error.message : "Failed to start the vision worker.")
      return
    }
  })

  const sharedAttempt = attempt.catch((error: unknown) => {
    if (w.__opencvPromise === sharedAttempt) delete w.__opencvPromise
    throw error
  })
  w.__opencvPromise = sharedAttempt
  return sharedAttempt
}

export type OpenCvState = {
  cv: VisionRuntime | null
  status: "idle" | "loading" | "ready" | "error"
  error: string | null
  detail: string | null
  load: () => void
}

export function useOpenCv(): OpenCvState {
  const [state, setState] = useState<{
    cv: VisionRuntime | null
    status: "idle" | "loading" | "ready" | "error"
    error: string | null
    detail: string | null
  }>({ cv: null, status: "idle", error: null, detail: null })
  const startedRef = useRef(false)

  const load = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true
    setState((prev) => ({
      ...prev,
      status: "loading",
      error: null,
      detail: "Starting vision worker",
    }))
    loadOpenCv((stage) => {
      setState((prev) => ({
        ...prev,
        detail:
          stage === "starting-worker"
            ? "Starting vision worker"
            : stage === "importing-worker-script"
              ? "Loading OpenCV inside worker"
              : stage === "initializing-runtime"
                ? "Initializing OpenCV runtime"
                : "OpenCV runtime ready",
      }))
    })
      .then((cv) =>
        setState({
          cv,
          status: "ready",
          error: null,
          detail: "OpenCV runtime ready",
        }),
      )
      .catch((err: unknown) => {
        startedRef.current = false
        setState({
          cv: null,
          status: "error",
          error: err instanceof Error ? err.message : "OpenCV.js failed to load",
          detail: null,
        })
      })
  }, [])

  return { ...state, load }
}
