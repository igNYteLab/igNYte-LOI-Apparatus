"use client"

import { Button } from "@/components/ui/button"

export function ErrorFallback({
  error,
  reset,
  title = "Something went wrong",
  description = "An unexpected error occurred. You can try again, and if the problem persists, reach out to support.",
}: {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  description?: string
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-sm text-muted-foreground">Error</p>
        <h1 className="text-2xl font-medium">{title}</h1>
        <p className="max-w-sm text-sm leading-loose text-muted-foreground">
          {description}
        </p>
        {error.digest ? (
          <p className="font-mono text-xs text-muted-foreground">
            Ref: {error.digest}
          </p>
        ) : null}
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
