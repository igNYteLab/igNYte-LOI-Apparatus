import type { DetectorOptions } from "./config"
import type { Detection } from "./detector"

// OpenCV.js ships no official TypeScript types and its surface is huge, so we
// centralize the untyped boundary here. The app keeps OpenCV inside a Web
// Worker so the React page does not freeze while the runtime loads or processes
// frames.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type OpenCvModule = any
export type OpenCvMat = any
/* eslint-enable @typescript-eslint/no-explicit-any */

export type VisionDetectResult = {
  detection: Detection
  mask: ImageData
}

export type VisionRuntime = {
  detect: (
    imageData: ImageData,
    options: DetectorOptions,
  ) => Promise<VisionDetectResult>
  dispose: () => void
}
