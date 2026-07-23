"use client"

import { useAuth } from "@/components/auth-provider"
import { AddUserDialog } from "@/components/user-management/add-user-dialog"
import { UsersTable } from "@/components/user-management/users-table"

export default function UsersPage() {
  const { isAdmin, profileLoading } = useAuth()

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              User Management
            </h1>
            <p className="text-muted-foreground text-sm">
              Add people to the app and manage their access.
            </p>
          </div>
          {isAdmin ? <AddUserDialog /> : null}
        </div>

        {profileLoading ? (
          <div className="text-muted-foreground rounded-lg border p-8 text-center text-sm">
            Checking your permissions…
          </div>
        ) : isAdmin ? (
          <UsersTable />
        ) : (
          <div className="rounded-lg border p-8 text-center">
            <p className="font-medium">Admins only</p>
            <p className="text-muted-foreground mt-1 text-sm">
              You don&apos;t have permission to manage users. Ask an existing
              admin to grant you the admin role.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
