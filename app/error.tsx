"use client"

import { useEffect } from "react"

import { ErrorFallback } from "@/components/error-fallback"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface the error to the console / future logging service.
    console.error(error)
  }, [error])

  return <ErrorFallback error={error} reset={reset} />
}
