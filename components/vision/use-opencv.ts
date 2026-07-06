"use client"

import { useEffect, useState } from "react"

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
      if (typeof cv.then === "function") {
        // Promise-style build.
        cv.then((ready: OpenCvModule) => resolve(ready)).catch(reject)
        return
      }
      if (cv.Mat) {
        resolve(cv) // Already initialized.
        return
      }
      cv.onRuntimeInitialized = () => resolve(w.cv as OpenCvModule)
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
  status: "loading" | "ready" | "error"
  error: string | null
}

/** React hook: lazily loads OpenCV.js and reports readiness. */
export function useOpenCv(): OpenCvState {
  const [state, setState] = useState<OpenCvState>({
    cv: null,
    status: "loading",
    error: null,
  })

  useEffect(() => {
    let active = true
    loadOpenCv()
      .then((cv) => {
        if (active) setState({ cv, status: "ready", error: null })
      })
      .catch((err: unknown) => {
        if (active) {
          setState({
            cv: null,
            status: "error",
            error: err instanceof Error ? err.message : "OpenCV.js failed to load",
          })
        }
      })
    return () => {
      active = false
    }
  }, [])

  return state
}
