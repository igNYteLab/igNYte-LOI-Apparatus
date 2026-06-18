"use client"

import { DataTable } from "@/components/data-table"
import { useTests } from "@/components/tests-provider"

export function TestRecordsTable() {
  const { tests, hydrated } = useTests()
  return <DataTable data={tests} loading={!hydrated} />
}
