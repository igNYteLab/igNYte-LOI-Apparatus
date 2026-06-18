"use client"

import { useEffect } from "react"

// global-error replaces the root layout, so it cannot rely on app styles or
// providers. Keep it self-contained with inline styles.
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.5rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 500 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#71717a", maxWidth: "24rem" }}>
            A critical error occurred. Please reload the page.
          </p>
        </div>
        <button
          onClick={reset}
          style={{
            cursor: "pointer",
            borderRadius: "0.375rem",
            border: "1px solid #e4e4e7",
            padding: "0.5rem 1rem",
            background: "#18181b",
            color: "#fafafa",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
