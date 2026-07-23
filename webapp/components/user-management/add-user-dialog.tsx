"use client"

import { useState } from "react"
import { IconUserPlus } from "@tabler/icons-react"
import { FirebaseError } from "firebase/app"
import { toast } from "sonner"

import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createUserAccount, type UserRole } from "@/lib/users"
import { validateField } from "@/lib/validation"

function describeError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/email-already-in-use":
        return "An account with that email already exists."
      case "auth/invalid-email":
        return "Enter a valid email address."
      case "permission-denied":
        return "You don't have permission to add users."
      default:
        return error.message
    }
  }
  return error instanceof Error ? error.message : "Something went wrong."
}

export function AddUserDialog() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState<UserRole>("member")
  const [touched, setTouched] = useState({ email: false, name: false })
  const [pending, setPending] = useState(false)

  const emailError = validateField("email", email)
  const nameError =
    name.trim().length === 0
      ? "A name is required."
      : name.trim().length > 80
        ? "Name is too long."
        : null
  const isValid = !emailError && !nameError

  function reset() {
    setEmail("")
    setName("")
    setRole("member")
    setTouched({ email: false, name: false })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTouched({ email: true, name: true })
    if (!isValid || !user || pending) return

    setPending(true)
    try {
      const created = await createUserAccount(
        { email, displayName: name, role },
        user.uid,
      )
      toast.success("User created", {
        description: `A password-setup link was sent to ${created.email}.`,
      })
      setOpen(false)
      reset()
    } catch (error) {
      toast.error("Could not create user", {
        description: describeError(error),
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <IconUserPlus />
          Add user
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Creates a Firebase account and emails the person a link to set
              their own password. They can sign in once they&apos;ve set it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, email: true }))}
                placeholder="name@nyu.edu"
                aria-invalid={touched.email && !!emailError}
                autoFocus
                disabled={pending}
              />
              {touched.email && emailError ? (
                <p className="text-xs text-destructive">{emailError}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user-name">Full name</Label>
              <Input
                id="user-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, name: true }))}
                placeholder="Jane Doe"
                aria-invalid={touched.name && !!nameError}
                disabled={pending}
              />
              {touched.name && nameError ? (
                <p className="text-xs text-destructive">{nameError}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user-role">Role</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as UserRole)}
                disabled={pending}
              >
                <SelectTrigger id="user-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Admins can manage users. Members get standard dashboard access.
              </p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!isValid || pending}>
              {pending ? "Creating…" : "Create & send link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
