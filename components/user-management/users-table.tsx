"use client"

import { useEffect, useState } from "react"
import { IconDotsVertical } from "@tabler/icons-react"
import { toast } from "sonner"

import { useAuth } from "@/components/auth-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  resendResetLink,
  setUserRole,
  setUserStatus,
  subscribeToUsers,
  type ManagedUser,
} from "@/lib/users"

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function RoleBadge({ role }: { role: ManagedUser["role"] }) {
  return (
    <Badge variant={role === "admin" ? "default" : "secondary"}>
      {role === "admin" ? "Admin" : "Member"}
    </Badge>
  )
}

function StatusBadge({ status }: { status: ManagedUser["status"] }) {
  const variant =
    status === "active"
      ? "default"
      : status === "disabled"
        ? "destructive"
        : "outline"
  const label =
    status === "active"
      ? "Active"
      : status === "disabled"
        ? "Disabled"
        : "Invited"
  return <Badge variant={variant}>{label}</Badge>
}

export function UsersTable() {
  const { user } = useAuth()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToUsers(
      (next) => {
        setUsers(next)
        setLoaded(true)
      },
      (error) => {
        setLoaded(true)
        toast.error("Could not load users", { description: error.message })
      },
    )
    return unsubscribe
  }, [])

  async function run(action: () => Promise<void>, success: string) {
    try {
      await action()
      toast.success(success)
    } catch (error) {
      toast.error("Action failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  if (!loaded) {
    return (
      <div className="text-muted-foreground rounded-lg border p-8 text-center text-sm">
        Loading users…
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border p-8 text-center text-sm">
        No users yet. Use <span className="font-medium">Add user</span> to
        create the first account.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Added</TableHead>
            <TableHead>Last sign-in</TableHead>
            <TableHead className="w-10 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => {
            const isSelf = u.uid === user?.uid
            return (
              <TableRow key={u.uid}>
                <TableCell>
                  <div className="font-medium">{u.displayName || "—"}</div>
                  <div className="text-muted-foreground text-xs">{u.email}</div>
                </TableCell>
                <TableCell>
                  <RoleBadge role={u.role} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={u.status} />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(u.createdAt)}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(u.lastLoginAt)}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Actions for ${u.email}`}
                      >
                        <IconDotsVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Manage</DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() =>
                          run(
                            () => resendResetLink(u.email),
                            `Reset link re-sent to ${u.email}.`,
                          )
                        }
                      >
                        Resend reset link
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={isSelf}
                        onClick={() =>
                          run(
                            () =>
                              setUserRole(
                                u.uid,
                                u.role === "admin" ? "member" : "admin",
                              ),
                            u.role === "admin"
                              ? `${u.email} is now a member.`
                              : `${u.email} is now an admin.`,
                          )
                        }
                      >
                        {u.role === "admin" ? "Demote to member" : "Make admin"}
                      </DropdownMenuItem>
                      {u.status === "disabled" ? (
                        <DropdownMenuItem
                          onClick={() =>
                            run(
                              () => setUserStatus(u.uid, "active"),
                              `${u.email} re-enabled.`,
                            )
                          }
                        >
                          Enable
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={isSelf}
                          onClick={() =>
                            run(
                              () => setUserStatus(u.uid, "disabled"),
                              `${u.email} disabled.`,
                            )
                          }
                        >
                          Disable
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
