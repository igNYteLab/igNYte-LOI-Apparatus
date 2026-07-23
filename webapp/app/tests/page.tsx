import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"

import { RecentTestsTable } from "@/components/test-monitor/recent-tests-table"
import { Button } from "@/components/ui/button"

export default function TestsPage() {
  return (
    <main className="flex min-h-svh flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="icon" className="size-8">
          <Link href="/dashboard">
            <IconArrowLeft />
            <span className="sr-only">Back to dashboard</span>
          </Link>
        </Button>
        <div>
          <h1 className="text-lg font-medium">Archived Tests</h1>
          <p className="text-sm text-muted-foreground">
            Full local history for saved ASTM D2863 sessions.
          </p>
        </div>
      </div>
      <RecentTestsTable
        limit={0}
        showViewAll={false}
        title="All Archived Tests"
        description="Local browser history, newest first."
      />
    </main>
  )
}
