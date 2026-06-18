"use client"

import * as React from "react"
import { IconCamera, IconRefresh, IconVideo } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type CameraSource = {
  id: string
  label: string
  kind: "usb" | "ip"
  deviceId?: string
  streamUrl?: string
}

type CameraState = "prompt" | "granted" | "denied" | "error" | "unavailable" | "ip"

export type CameraController = {
  getRecordingStream: () => Promise<MediaStream>
  stopRecordingCapture: () => void
}

type CameraCardProps = {
  title: string
  description: string
  storageKey: string
  streamUrl?: string
  recordable: boolean
  recording: boolean
  variant?: "rgb" | "hsi"
}

export const CameraCard = React.forwardRef<CameraController, CameraCardProps>(
  function CameraCard(
    {
      title,
      description,
      storageKey,
      streamUrl,
      recordable,
      recording,
      variant = "rgb",
    },
    ref,
  ) {
    const videoRef = React.useRef<HTMLVideoElement | null>(null)
    const imageRef = React.useRef<HTMLImageElement | null>(null)
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
    const streamRef = React.useRef<MediaStream | null>(null)
    const canvasPumpRef = React.useRef<number | null>(null)
    const autoStartRef = React.useRef<string | null>(null)

    const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([])
    const [sourceId, setSourceId] = React.useState("")
    const [state, setState] = React.useState<CameraState>("prompt")
    const [error, setError] = React.useState<string | null>(null)

    const sources = React.useMemo<CameraSource[]>(() => {
      const usbSources = devices.map((device, index) => ({
        id: `usb:${device.deviceId}`,
        label: device.label || `USB camera ${index + 1}`,
        kind: "usb" as const,
        deviceId: device.deviceId,
      }))

      return streamUrl
        ? [
            ...usbSources,
            {
              id: "ip:stream",
              label: "IP camera stream",
              kind: "ip" as const,
              streamUrl,
            },
          ]
        : usbSources
    }, [devices, streamUrl])

    const selectedSource =
      sources.find((source) => source.id === sourceId) ?? sources[0] ?? null

    const stopCanvasPump = React.useCallback(() => {
      if (canvasPumpRef.current !== null) {
        window.clearInterval(canvasPumpRef.current)
        canvasPumpRef.current = null
      }
    }, [])

    const stopUsbStream = React.useCallback(() => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }, [])

    const enumerateDevices = React.useCallback(async () => {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setDevices([])
        setState(streamUrl ? "ip" : "unavailable")
        return
      }

      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = allDevices.filter(
          (device) => device.kind === "videoinput",
        )
        setDevices(videoDevices)
        setError(null)
        const stored = window.localStorage.getItem(storageKey)
        if (stored) setSourceId(stored)
      } catch (err) {
        setDevices([])
        setError(
          err instanceof Error ? err.message : "Unable to enumerate cameras.",
        )
        setState(streamUrl ? "ip" : "error")
      }
    }, [storageKey, streamUrl])

    const requestUsbAccess = React.useCallback(
      async (source: CameraSource | null) => {
        if (!source?.deviceId || !navigator.mediaDevices?.getUserMedia) {
          setState("unavailable")
          return null
        }

        stopUsbStream()
        setError(null)
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: source.deviceId } },
            audio: false,
          })
          streamRef.current = stream
          if (videoRef.current) {
            videoRef.current.srcObject = stream
            await videoRef.current.play().catch(() => undefined)
          }
          setState("granted")
          void enumerateDevices()
          return stream
        } catch (err) {
          const denied =
            err instanceof DOMException &&
            (err.name === "NotAllowedError" || err.name === "SecurityError")
          setState(denied ? "denied" : "error")
          setError(
            denied
              ? "Camera permission was denied."
              : err instanceof Error
                ? err.message
                : "Unable to start this camera.",
          )
          return null
        }
      },
      [enumerateDevices, stopUsbStream],
    )

    const captureIpStream = React.useCallback(() => {
      const image = imageRef.current
      const canvas = canvasRef.current
      if (!image || !canvas) {
        throw new Error("IP camera is not ready.")
      }
      if (!image.complete || !image.naturalWidth || !image.naturalHeight) {
        throw new Error("IP camera frame is not loaded yet.")
      }

      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext("2d")
      if (!context) {
        throw new Error("Browser canvas capture is unavailable.")
      }

      const draw = () => {
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
      }

      try {
        draw()
      } catch {
        throw new Error(
          "Video capture failed. Check that the IP camera sends CORS headers.",
        )
      }

      stopCanvasPump()
      canvasPumpRef.current = window.setInterval(() => {
        try {
          draw()
        } catch {
          stopCanvasPump()
        }
      }, 100)

      return canvas.captureStream(10)
    }, [stopCanvasPump])

    React.useImperativeHandle(
      ref,
      () => ({
        async getRecordingStream() {
          if (!recordable) {
            throw new Error("This camera is monitoring-only.")
          }
          if (!selectedSource) {
            throw new Error("No RGB camera source is selected.")
          }
          if (selectedSource.kind === "ip") {
            return captureIpStream()
          }

          if (!streamRef.current) {
            const stream = await requestUsbAccess(selectedSource)
            if (!stream) throw new Error("Unable to access the RGB camera.")
            return stream
          }
          return streamRef.current
        },
        stopRecordingCapture() {
          stopCanvasPump()
        },
      }),
      [
        captureIpStream,
        recordable,
        requestUsbAccess,
        selectedSource,
        stopCanvasPump,
      ],
    )

    React.useEffect(() => {
      void enumerateDevices()
      navigator.mediaDevices?.addEventListener?.("devicechange", enumerateDevices)
      return () => {
        navigator.mediaDevices?.removeEventListener?.(
          "devicechange",
          enumerateDevices,
        )
      }
    }, [enumerateDevices])

    React.useEffect(() => {
      if (!sources.length) {
        setSourceId("")
        setState(streamUrl ? "ip" : "unavailable")
        return
      }

      setSourceId((current) => {
        if (current && sources.some((source) => source.id === current)) {
          return current
        }
        return sources[0].id
      })
    }, [sources, streamUrl])

    React.useEffect(() => {
      stopCanvasPump()
      if (!selectedSource) return

      if (selectedSource.kind === "ip") {
        stopUsbStream()
        setState("ip")
        setError(null)
        return
      }

      if (streamRef.current && state === "granted") return
      stopUsbStream()
      if (state !== "denied" && state !== "error") {
        setState("prompt")
      }
    }, [
      selectedSource?.id,
      selectedSource,
      state,
      stopCanvasPump,
      stopUsbStream,
    ])

    // getUserMedia can resolve before the <video> exists (it only mounts once
    // state is "granted"). Bind the live stream to the element here so the feed
    // actually appears instead of staying black after permission is granted.
    React.useEffect(() => {
      const video = videoRef.current
      if (state === "granted" && video && streamRef.current) {
        if (video.srcObject !== streamRef.current) {
          video.srcObject = streamRef.current
        }
        void video.play().catch(() => undefined)
      }
    }, [state])

    // When the origin already holds camera permission, start the USB feed
    // automatically (once per source) so the live video shows without a click.
    React.useEffect(() => {
      const source = selectedSource
      if (!source || source.kind !== "usb" || state !== "prompt") return
      if (autoStartRef.current === source.id) return
      const permissions = navigator.permissions
      if (!permissions?.query) return
      autoStartRef.current = source.id
      permissions
        .query({ name: "camera" as PermissionName })
        .then((status) => {
          if (status.state === "granted") void requestUsbAccess(source)
        })
        .catch(() => undefined)
    }, [selectedSource, state, requestUsbAccess])

    React.useEffect(() => {
      return () => {
        stopCanvasPump()
        stopUsbStream()
      }
    }, [stopCanvasPump, stopUsbStream])

    function handleSourceChange(value: string) {
      setSourceId(value)
      window.localStorage.setItem(storageKey, value)
    }

    const showUsbPrompt = selectedSource?.kind === "usb" && state !== "granted"

    return (
      <Card className="h-full min-h-0" size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            {variant === "hsi" ? <IconVideo /> : <IconCamera />}
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
          <CardAction className="flex items-center gap-2">
            {variant === "hsi" ? <Badge variant="outline">HSI</Badge> : null}
            {recording && recordable ? (
              <Badge variant="destructive" className="animate-pulse">
                REC
              </Badge>
            ) : null}
          </CardAction>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <Select
            value={selectedSource?.id ?? ""}
            onValueChange={handleSourceChange}
            disabled={recording || !sources.length}
          >
            <SelectTrigger className="w-full" aria-label={`${title} source`}>
              <SelectValue placeholder="Select camera source" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {sources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <div className="relative flex aspect-video min-h-0 items-center justify-center overflow-hidden rounded-md bg-muted/50 ring-1 ring-foreground/10 lg:aspect-auto lg:flex-1">
            {selectedSource?.kind === "ip" ? (
              // eslint-disable-next-line @next/next/no-img-element -- MJPEG/IP streams must render as a plain image element.
              <img
                ref={imageRef}
                src={selectedSource.streamUrl}
                alt={`${title} stream`}
                crossOrigin="anonymous"
                className="h-full w-full object-cover"
              />
            ) : state === "granted" ? (
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex max-w-sm flex-col items-center gap-3 p-4 text-center">
                <p className="text-sm font-medium">
                  {state === "denied"
                    ? "Camera access denied"
                    : state === "error"
                      ? "Camera unavailable"
                      : state === "unavailable"
                        ? "No camera source available"
                        : "Camera permission required"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {error ??
                    "Allow browser camera access to show the live USB feed."}
                </p>
                {showUsbPrompt ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void requestUsbAccess(selectedSource)}
                  >
                    <IconRefresh data-icon="inline-start" />
                    {state === "prompt" ? "Enable camera" : "Retry camera"}
                  </Button>
                ) : null}
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </CardContent>
      </Card>
    )
  },
)
