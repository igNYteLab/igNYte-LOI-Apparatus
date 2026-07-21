// Ported from the prototype's src/detector.js: HSV threshold → morphology →
// largest contour → bounding box, bottom-most point, and a confidence score.
// The OpenCV `Mat` cleanup in the `finally` block is essential — without it the
// WASM heap leaks every frame and the tab eventually crashes.

import type { DetectorOptions } from "./config"
import type { OpenCvMat, OpenCvModule } from "./opencv-types"

export type BBox = { x: number; y: number; width: number; height: number }
export type Point = { x: number; y: number }

export type Detection =
  | { tracking: false; confidence: number }
  | {
      tracking: true
      confidence: number
      areaPx: number
      bbox: BBox
      bottomXPx: number
      bottomYPx: number
      contour: Point[]
    }

export type DetectResult = { mask: OpenCvMat; detection: Detection }

export function detectTarget(
  cv: OpenCvModule,
  sourceCanvas: HTMLCanvasElement,
  options: DetectorOptions,
): DetectResult {
  const src = cv.imread(sourceCanvas)
  const rgb = new cv.Mat()
  const hsv = new cv.Mat()
  const brightMask = new cv.Mat()
  const coloredMask = new cv.Mat()
  const mask = new cv.Mat()
  const cleaned = new cv.Mat()
  const brightLow = new cv.Mat(src.rows, src.cols, cv.CV_8UC3, [
    options.brightHsvLow.h,
    options.brightHsvLow.s,
    options.brightHsvLow.v,
    0,
  ])
  const brightHigh = new cv.Mat(src.rows, src.cols, cv.CV_8UC3, [
    options.brightHsvHigh.h,
    options.brightHsvHigh.s,
    options.brightHsvHigh.v,
    0,
  ])
  const coloredLow = new cv.Mat(src.rows, src.cols, cv.CV_8UC3, [
    options.coloredHsvLow.h,
    options.coloredHsvLow.s,
    options.coloredHsvLow.v,
    0,
  ])
  const coloredHigh = new cv.Mat(src.rows, src.cols, cv.CV_8UC3, [
    options.coloredHsvHigh.h,
    options.coloredHsvHigh.s,
    options.coloredHsvHigh.v,
    0,
  ])
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  const kernelSize = Math.max(1, options.kernelSizePx | 0)
  const kernel = cv.Mat.ones(kernelSize, kernelSize, cv.CV_8U)

  try {
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB)
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV)
    cv.inRange(hsv, brightLow, brightHigh, brightMask)
    cv.inRange(hsv, coloredLow, coloredHigh, coloredMask)
    cv.bitwise_or(brightMask, coloredMask, mask)
    cv.morphologyEx(mask, cleaned, cv.MORPH_OPEN, kernel)
    cv.morphologyEx(cleaned, cleaned, cv.MORPH_CLOSE, kernel)
    cv.findContours(
      cleaned,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    )

    let best: { contour: OpenCvMat; areaPx: number } | null = null
    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i)
      const area = cv.contourArea(contour)
      if (area >= options.minAreaPx && (!best || area > best.areaPx)) {
        if (best) best.contour.delete()
        best = { contour, areaPx: area }
      } else {
        contour.delete()
      }
    }

    if (!best) {
      return {
        mask: cleaned.clone(),
        detection: { tracking: false, confidence: 0 },
      }
    }

    const rect = cv.boundingRect(best.contour)
    const points = contourPoints(best.contour)
    const bottom = bottomPoint(points)
    const contour = simplifyContour(cv, best.contour)
    const confidence = computeConfidence(
      best.areaPx,
      options.minAreaPx,
      src.rows,
      src.cols,
    )
    best.contour.delete()

    return {
      mask: cleaned.clone(),
      detection: {
        tracking: true,
        confidence,
        areaPx: best.areaPx,
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

function contourPoints(contour: OpenCvMat): Point[] {
  const points: Point[] = []
  const data = contour.data32S as Int32Array
  for (let i = 0; i < data.length; i += 2) {
    points.push({ x: data[i], y: data[i + 1] })
  }
  return points
}

function bottomPoint(points: Point[]): Point {
  let best = points[0] ?? { x: 0, y: 0 }
  for (const point of points) {
    if (point.y > best.y) best = point
  }
  return best
}

function simplifyContour(cv: OpenCvModule, contour: OpenCvMat): Point[] {
  const approx = new cv.Mat()
  try {
    const epsilon = 0.006 * cv.arcLength(contour, true)
    cv.approxPolyDP(contour, approx, epsilon, true)
    return contourPoints(approx)
  } finally {
    approx.delete()
  }
}

function computeConfidence(
  areaPx: number,
  minAreaPx: number,
  rows: number,
  cols: number,
): number {
  const areaScore = Math.min(1, areaPx / Math.max(minAreaPx * 8, 1))
  const frameArea = Math.max(rows * cols, 1)
  const frameScore = Math.min(1, areaPx / (frameArea * 0.08))
  return Math.max(0, Math.min(1, 0.35 + 0.45 * areaScore + 0.2 * frameScore))
}
