import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// Relative widths that mirror the Test Records columns:
// Test ID · Date & Time · Net ID · Name · Email · Remarks
const TABLE_COLS = "grid-cols-[1.3fr_1.1fr_0.7fr_1.1fr_1.5fr_1.2fr]"

/**
 * Skeleton that mirrors the Test Records DataTable: heading + columns button,
 * a bordered table with a header row and body rows, and the pager footer.
 */
export function TestRecordsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4 px-4 lg:px-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-24" />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className={cn("grid items-center gap-4 bg-muted px-3 py-2.5", TABLE_COLS)}>
          {[60, 70, 44, 56, 80, 64].map((w, i) => (
            <Skeleton key={i} className="h-3.5" style={{ width: w }} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className={cn(
              "grid items-center gap-4 border-t px-3 py-3.5",
              TABLE_COLS,
            )}
          >
            <Skeleton className="h-3.5 w-[88%]" />
            <Skeleton className="h-3.5 w-[80%]" />
            <Skeleton className="h-3.5 w-[60%]" />
            <Skeleton className="h-3.5 w-[75%]" />
            <Skeleton className="h-3.5 w-[90%]" />
            <Skeleton className="h-3.5 w-[70%]" />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-16" />
        <div className="flex items-center gap-2">
          <Skeleton className="hidden h-7 w-28 lg:block" />
          <Skeleton className="h-4 w-20" />
          <div className="flex items-center gap-2">
            <Skeleton className="size-8" />
            <Skeleton className="size-8" />
            <Skeleton className="size-8" />
            <Skeleton className="size-8" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Skeleton rows for the body of an existing table (DataTable / RecentTests). */
export function TableRowsSkeleton({
  rows = 6,
  columns,
}: {
  rows?: number
  columns: number
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b">
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="p-2 align-middle">
              <Skeleton className="h-3.5" style={{ width: `${55 + ((c * 13) % 35)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

function MonitorCardSkeleton({
  className,
  variant = "list",
}: {
  className?: string
  variant?: "list" | "media" | "chart"
}) {
  return (
    <Card className={cn("min-h-0", className)} size="sm">
      <CardHeader>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-44" />
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {variant === "media" ? (
          <Skeleton className="aspect-video w-full lg:aspect-auto lg:h-full" />
        ) : variant === "chart" ? (
          <div className="grid h-full min-h-[150px] gap-3 xl:grid-cols-3">
            <Skeleton className="h-full min-h-[140px] w-full" />
            <Skeleton className="hidden h-full min-h-[140px] w-full xl:block" />
            <Skeleton className="hidden h-full min-h-[140px] w-full xl:block" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md border p-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Skeleton that mirrors the Test Monitor page: the back-link header, the
 * monitor toolbar, and the 12-column card grid (sensors, two cameras, trends,
 * session recording).
 */
export function MonitorGridSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 rounded-md" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>

      <div className="grid min-h-0 gap-3 lg:h-[calc(100svh-var(--header-height)-8rem)] lg:grid-cols-12 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
        <MonitorCardSkeleton className="lg:col-span-3" variant="list" />
        <MonitorCardSkeleton className="lg:col-span-5" variant="media" />
        <MonitorCardSkeleton className="lg:col-span-4" variant="media" />
        <MonitorCardSkeleton className="lg:col-span-8" variant="chart" />
        <MonitorCardSkeleton className="lg:col-span-4" variant="list" />
      </div>
    </div>
  )
}

/**
 * Full dashboard shell skeleton (sidebar + header + content), used while auth
 * resolves and the real <SidebarProvider> shell has not mounted yet.
 */
export function DashboardShellSkeleton({
  children,
}: {
  children?: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh w-full bg-sidebar">
      {/* Sidebar rail */}
      <div className="hidden w-72 shrink-0 flex-col gap-4 p-3 md:flex">
        <Skeleton className="h-7 w-40 bg-sidebar-accent" />
        <Skeleton className="h-8 w-full rounded-lg bg-sidebar-accent" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-7 w-full bg-sidebar-accent" />
          <Skeleton className="h-7 w-full bg-sidebar-accent" />
        </div>
        <div className="mt-auto">
          <Skeleton className="h-10 w-full bg-sidebar-accent" />
        </div>
      </div>

      {/* Main inset */}
      <div className="flex min-w-0 flex-1 flex-col bg-background md:m-2 md:ml-0 md:rounded-xl md:shadow-sm">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4 lg:px-6">
          <Skeleton className="size-7" />
          <Skeleton className="ml-1 h-4 w-24" />
          <Skeleton className="ml-auto size-7 rounded-full" />
        </div>
        <div className="flex flex-1 flex-col py-4 md:py-6">
          {children ?? <TestRecordsSkeleton />}
        </div>
      </div>
    </div>
  )
}
