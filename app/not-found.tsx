import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-2xl font-medium">Page not found</h1>
        <p className="max-w-sm text-sm leading-loose text-muted-foreground">
          Sorry, we couldn&apos;t find the page you&apos;re looking for. It may
          have been moved or deleted.
        </p>
      </div>
      <Button asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  )
}
