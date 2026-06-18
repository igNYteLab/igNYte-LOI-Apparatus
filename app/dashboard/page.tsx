import { TestRecordsTable } from "@/components/test-records-table"

export default function Page() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <TestRecordsTable />
        </div>
      </div>
    </div>
  )
}
