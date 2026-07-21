/* global cv, importScripts */

const OPENCV_SRC = "/vendor/opencv/opencv-63366510.js"
const LOAD_TIMEOUT_MS = 30000

let ready = false
let observedCv = null
let loadSettled = false

function post(type, payload = {}) {
  self.postMessage({ type, ...payload })
}

function settleReady() {
  if (loadSettled) return
  loadSettled = true
  ready = true
  post("ready")
}

function settleError(message) {
  if (loadSettled) return
  loadSettled = true
  post("error", { error: message })
}

function inspectRuntime() {
  const runtime = self.cv
  if (!runtime) return
  if (typeof runtime.Mat === "function") {
    settleReady()
    return
  }

  if (runtime !== observedCv) {
    observedCv = runtime
    const previousCallback = runtime.onRuntimeInitialized
    runtime.onRuntimeInitialized = () => {
      try {
        if (typeof previousCallback === "function") previousCallback()
      } finally {
        inspectRuntime()
      }
    }
  }
}

function loadOpenCv() {
  try {
    post("stage", { stage: "importing-worker-script" })
    importScripts(OPENCV_SRC)
    post("stage", { stage: "initializing-runtime" })
    inspectRuntime()
    const pollId = self.setInterval(() => {
      if (loadSettled) {
        self.clearInterval(pollId)
        return
      }
      inspectRuntime()
    }, 50)
    self.setTimeout(() => {
      self.clearInterval(pollId)
      settleError(
        "OpenCV.js loaded in the worker, but its runtime did not initialize within 30 seconds.",
      )
    }, LOAD_TIMEOUT_MS)
  } catch (error) {
    settleError(
      error instanceof Error
        ? error.message
        : "OpenCV.js failed to load in the vision worker.",
    )
  }
}

function contourPoints(contour) {
  const points = []
  const data = contour.data32S
  for (let i = 0; i < data.length; i += 2) {
    points.push({ x: data[i], y: data[i + 1] })
  }
  return points
}

function bottomPoint(points) {
  let best = points[0] ?? { x: 0, y: 0 }
  for (const point of points) {
    if (point.y > best.y) best = point
  }
  return best
}

function simplifyContour(runtime, contour) {
  const approx = new runtime.Mat()
  try {
    const epsilon = 0.006 * runtime.arcLength(contour, true)
    runtime.approxPolyDP(contour, approx, epsilon, true)
    return contourPoints(approx)
  } finally {
    approx.delete()
  }
}

function computeConfidence(areaPx, minAreaPx, rows, cols) {
  const areaScore = Math.min(1, areaPx / Math.max(minAreaPx * 8, 1))
  const frameArea = Math.max(rows * cols, 1)
  const frameScore = Math.min(1, areaPx / (frameArea * 0.08))
  return Math.max(0, Math.min(1, 0.35 + 0.45 * areaScore + 0.2 * frameScore))
}

function maskImageData(runtime, mask) {
  const rgba = new runtime.Mat()
  try {
    runtime.cvtColor(mask, rgba, runtime.COLOR_GRAY2RGBA)
    return new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows)
  } finally {
    rgba.delete()
  }
}

function detectTarget(imageData, options, includeMask) {
  const runtime = cv
  const src = runtime.matFromImageData(imageData)
  const rgb = new runtime.Mat()
  const hsv = new runtime.Mat()
  const brightMask = new runtime.Mat()
  const coloredMask = new runtime.Mat()
  const mask = new runtime.Mat()
  const cleaned = new runtime.Mat()
  const brightLow = new runtime.Mat(src.rows, src.cols, runtime.CV_8UC3, [
    options.brightHsvLow.h,
    options.brightHsvLow.s,
    options.brightHsvLow.v,
    0,
  ])
  const brightHigh = new runtime.Mat(src.rows, src.cols, runtime.CV_8UC3, [
    options.brightHsvHigh.h,
    options.brightHsvHigh.s,
    options.brightHsvHigh.v,
    0,
  ])
  const coloredLow = new runtime.Mat(src.rows, src.cols, runtime.CV_8UC3, [
    options.coloredHsvLow.h,
    options.coloredHsvLow.s,
    options.coloredHsvLow.v,
    0,
  ])
  const coloredHigh = new runtime.Mat(src.rows, src.cols, runtime.CV_8UC3, [
    options.coloredHsvHigh.h,
    options.coloredHsvHigh.s,
    options.coloredHsvHigh.v,
    0,
  ])
  const contours = new runtime.MatVector()
  const hierarchy = new runtime.Mat()
  const kernelSize = Math.max(1, options.kernelSizePx | 0)
  const kernel = runtime.Mat.ones(kernelSize, kernelSize, runtime.CV_8U)

  try {
    runtime.cvtColor(src, rgb, runtime.COLOR_RGBA2RGB)
    runtime.cvtColor(rgb, hsv, runtime.COLOR_RGB2HSV)
    runtime.inRange(hsv, brightLow, brightHigh, brightMask)
    runtime.inRange(hsv, coloredLow, coloredHigh, coloredMask)
    runtime.bitwise_or(brightMask, coloredMask, mask)
    runtime.morphologyEx(mask, cleaned, runtime.MORPH_OPEN, kernel)
    runtime.morphologyEx(cleaned, cleaned, runtime.MORPH_CLOSE, kernel)
    runtime.findContours(
      cleaned,
      contours,
      hierarchy,
      runtime.RETR_EXTERNAL,
      runtime.CHAIN_APPROX_SIMPLE,
    )

    let best = null
    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i)
      const area = runtime.contourArea(contour)
      if (area >= options.minAreaPx && (!best || area > best.areaPx)) {
        if (best) best.contour.delete()
        best = { contour, areaPx: area }
      } else {
        contour.delete()
      }
    }

    if (!best) {
      return {
        mask: includeMask ? maskImageData(runtime, cleaned) : null,
        detection: { tracking: false, confidence: 0 },
      }
    }

    const rect = runtime.boundingRect(best.contour)
    const points = contourPoints(best.contour)
    const bottom = bottomPoint(points)
    const contour = simplifyContour(runtime, best.contour)
    const confidence = computeConfidence(
      best.areaPx,
      options.minAreaPx,
      src.rows,
      src.cols,
    )
    const areaPx = best.areaPx
    best.contour.delete()

    return {
      mask: includeMask ? maskImageData(runtime, cleaned) : null,
      detection: {
        tracking: true,
        confidence,
        areaPx,
        bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        bottomXPx: bottom.x,
        bottomYPx: bottom.y,
        contour,
      },
    }
  } finally {
    src.delete()
    rgb.delete()
    hsv.delete()
    brightMask.delete()
    coloredMask.delete()
    mask.delete()
    cleaned.delete()
    brightLow.delete()
    brightHigh.delete()
    coloredLow.delete()
    coloredHigh.delete()
    contours.delete()
    hierarchy.delete()
    kernel.delete()
  }
}

self.onmessage = (event) => {
  const message = event.data
  if (message?.type !== "detect") return
  if (!ready) {
    post("detect-error", {
      id: message.id,
      error: "OpenCV runtime is not ready.",
    })
    return
  }

  try {
    const result = detectTarget(
      message.imageData,
      message.options,
      message.includeMask === true,
    )
    const response = {
      type: "detected",
      id: message.id,
      detection: result.detection,
      mask: result.mask,
    }
    if (result.mask) {
      self.postMessage(response, [result.mask.data.buffer])
    } else {
      self.postMessage(response)
    }
  } catch (error) {
    post("detect-error", {
      id: message.id,
      error:
        error instanceof Error
          ? error.message
          : "OpenCV detection failed in the vision worker.",
    })
  }
}

loadOpenCv()
