"use client"

import { useEffect } from "react"

import { ErrorFallback } from "@/components/error-fallback"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Couldn't load the dashboard"
      description="Something went wrong while loading this view. Try again, or reload the page."
    />
  )
}
