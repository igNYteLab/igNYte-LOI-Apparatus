import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex min-h-svh flex-col gap-4 p-6">
      <Skeleton className="h-6 w-44" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-9 w-24 rounded-md" />
    </div>
  )
}
