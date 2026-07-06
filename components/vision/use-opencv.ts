"use client"

import { useCallback, useRef, useState } from "react"

import type { OpenCvModule } from "@/lib/vision/opencv-types"

const OPENCV_SRC = "https://docs.opencv.org/4.x/opencv.js"
const SCRIPT_ID = "opencv-js"

type OpenCvWindow = Window & {
  cv?: OpenCvModule
  __opencvPromise?: Promise<OpenCvModule>
}

/** Load OpenCV.js from the CDN exactly once and resolve when its WASM runtime
 *  is initialized. Handles both the object-style and promise-style builds. */
function loadOpenCv(): Promise<OpenCvModule> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV.js requires a browser"))
  }
  const w = window as OpenCvWindow
  if (w.__opencvPromise) return w.__opencvPromise

  w.__opencvPromise = new Promise<OpenCvModule>((resolve, reject) => {
    const attach = () => {
      const cv = w.cv
      if (!cv) {
        // Script executed but `cv` not attached yet — retry shortly.
        window.setTimeout(attach, 30)
        return
      }
      if (typeof cv.Mat === "function") {
        resolve(cv) // Already initialized.
        return
      }
      // OpenCV.js's module is an Emscripten "thenable", not a real Promise, so
      // do NOT call cv.then(). Register the runtime-init callback and also poll
      // for the Mat constructor as a robust fallback across builds.
      cv.onRuntimeInitialized = () => resolve(w.cv as OpenCvModule)
      const startedAt = Date.now()
      const poll = window.setInterval(() => {
        if (typeof w.cv?.Mat === "function") {
          window.clearInterval(poll)
          resolve(w.cv as OpenCvModule)
        } else if (Date.now() - startedAt > 30000) {
          window.clearInterval(poll)
          reject(new Error("OpenCV.js runtime did not initialize in time"))
        }
      }, 50)
    }

    const existing = document.getElementById(SCRIPT_ID)
    if (existing) {
      attach()
      return
    }

    const script = document.createElement("script")
    script.id = SCRIPT_ID
    script.src = OPENCV_SRC
    script.async = true
    script.onload = attach
    script.onerror = () => reject(new Error("Failed to load OpenCV.js"))
    document.body.appendChild(script)
  })

  return w.__opencvPromise
}

export type OpenCvState = {
  cv: OpenCvModule | null
  status: "idle" | "loading" | "ready" | "error"
  error: string | null
  /** Kick off the (heavy) OpenCV.js download + WASM compile. */
  load: () => void
}

/**
 * Loads OpenCV.js on demand — call `load()`. Loading is explicit because the
 * ~8 MB WASM compile briefly blocks the main thread, and we don't want that to
 * happen just by opening the Vision tab.
 */
export function useOpenCv(): OpenCvState {
  const [state, setState] = useState<{
    cv: OpenCvModule | null
    status: "idle" | "loading" | "ready" | "error"
    error: string | null
  }>({ cv: null, status: "idle", error: null })
  const startedRef = useRef(false)

  const load = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true
    setState((prev) => ({ ...prev, status: "loading", error: null }))
    loadOpenCv()
      .then((cv) => setState({ cv, status: "ready", error: null }))
      .catch((err: unknown) => {
        startedRef.current = false
        setState({
          cv: null,
          status: "error",
          error: err instanceof Error ? err.message : "OpenCV.js failed to load",
        })
      })
  }, [])

  return { ...state, load }
}
