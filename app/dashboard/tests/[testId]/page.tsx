"use client"

import { use } from "react"
import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"

import { fullName } from "@/components/data-table"
import { MonitorGrid } from "@/components/test-monitor/monitor-grid"
import { MonitorGridSkeleton } from "@/components/skeletons"
import { useTests } from "@/components/tests-provider"
import { Button } from "@/components/ui/button"

export default function TestMonitorPage({
  params,
}: {
  params: Promise<{ testId: string }>
}) {
  const { testId } = use(params)
  const { getTest, hydrated } = useTests()
  const test = getTest(testId)

  if (!hydrated) {
    return <MonitorGridSkeleton />
  }

  if (!test) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
        <div>
          <h1 className="text-lg font-medium">Test not found</h1>
          <p className="text-sm text-muted-foreground">
            No test matches this ID. It may have been cleared.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="icon" className="size-8">
            <Link href="/dashboard">
              <IconArrowLeft />
              <span className="sr-only">Back to dashboard</span>
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-medium">Test Monitoring</h1>
            <p className="font-mono text-xs text-muted-foreground">
              {test.testId}
            </p>
          </div>
        </div>
      </div>

      <MonitorGrid
        context={{
          operator: fullName(test),
          sample: test.testId,
          testId: test.testId,
        }}
      />
     
    </div>
  )
}
