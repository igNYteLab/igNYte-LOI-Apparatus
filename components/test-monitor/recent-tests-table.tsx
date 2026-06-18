"use client"

import * as React from "react"
import Link from "next/link"
import { IconDownload, IconTrash } from "@tabler/icons-react"

import { TableRowsSkeleton } from "@/components/skeletons"
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  deleteTestArchive,
  downloadTextFile,
  readTestArchive,
  sanitizeArchiveName,
  TEST_ARCHIVE_CHANGED_EVENT,
  TEST_ARCHIVE_STORAGE_KEY,
  type TestArchiveEntry,
} from "@/lib/test-monitor"

type RecentTestsTableProps = {
  limit?: number
  showViewAll?: boolean
  title?: string
  description?: string
}

export function RecentTestsTable({
  limit = 5,
  showViewAll = true,
  title = "Recent Tests",
  description = "Locally archived oxygen-index sessions.",
}: RecentTestsTableProps) {
  const [entries, setEntries] = React.useState<TestArchiveEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [deleteTarget, setDeleteTarget] =
    React.useState<TestArchiveEntry | null>(null)

  const refresh = React.useCallback(() => {
    setEntries(
      readTestArchive().sort(
        (a, b) =>
          new Date(b.meta.stoppedAt).getTime() -
          new Date(a.meta.stoppedAt).getTime(),
      ),
    )
    setLoading(false)
  }, [])

  React.useEffect(() => {
    const refreshHandle = window.setTimeout(refresh, 0)

    function onStorage(event: StorageEvent) {
      if (event.key === TEST_ARCHIVE_STORAGE_KEY) refresh()
    }

    window.addEventListener(TEST_ARCHIVE_CHANGED_EVENT, refresh)
    window.addEventListener("storage", onStorage)
    return () => {
      window.clearTimeout(refreshHandle)
      window.removeEventListener(TEST_ARCHIVE_CHANGED_EVENT, refresh)
      window.removeEventListener("storage", onStorage)
    }
  }, [refresh])

  const visibleEntries = limit > 0 ? entries.slice(0, limit) : entries

  function downloadArchive(entry: TestArchiveEntry) {
    const filename = `${sanitizeArchiveName(entry.meta.name)}.json`
    downloadTextFile(
      filename,
      JSON.stringify({ meta: entry.meta, samples: entry.samples }, null, 2),
    )
  }

  function confirmDelete() {
    if (!deleteTarget) return
    deleteTestArchive(deleteTarget.id)
    setDeleteTarget(null)
    refresh()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
          {showViewAll ? (
            <CardAction>
              <Button asChild variant="outline" size="sm">
                <Link href="/tests">View all</Link>
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Operator</TableHead>
                <TableHead>Sample</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Samples</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRowsSkeleton rows={limit > 0 ? limit : 5} columns={6} />
              ) : visibleEntries.length ? (
                visibleEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatIso(entry.meta.stoppedAt)}</TableCell>
                    <TableCell>{entry.meta.operator ?? "Operator"}</TableCell>
                    <TableCell>{entry.meta.sample ?? entry.meta.name}</TableCell>
                    <TableCell>{entry.meta.durationSeconds}s</TableCell>
                    <TableCell>{entry.meta.sampleCount}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Download ${entry.meta.name}`}
                          onClick={() => downloadArchive(entry)}
                        >
                          <IconDownload />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${entry.meta.name}`}
                          onClick={() => setDeleteTarget(entry)}
                        >
                          <IconTrash />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No archived tests yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete archived test</DialogTitle>
            <DialogDescription>
              This removes the local archive entry. Downloaded files already on
              disk are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function formatIso(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().replace("T", " ").slice(0, 16)
}
