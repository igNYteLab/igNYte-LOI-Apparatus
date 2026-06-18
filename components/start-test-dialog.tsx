"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { IconCirclePlusFilled } from "@tabler/icons-react"

import { useTests } from "@/components/tests-provider"
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
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { Textarea } from "@/components/ui/textarea"
import { validateField, type FieldKind } from "@/lib/validation"

const FIELDS = {
  netId: "netId",
  firstName: "name",
  middleName: "name",
  lastName: "name",
  email: "email",
  remarks: "remarks",
} satisfies Record<string, FieldKind>

type FormField = keyof typeof FIELDS

const EMPTY_FORM: Record<FormField, string> = {
  netId: "",
  firstName: "",
  middleName: "",
  lastName: "",
  email: "",
  remarks: "",
}

export function StartNewTestButton() {
  const router = useRouter()
  const { addTest } = useTests()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [touched, setTouched] = useState<Record<FormField, boolean>>({
    netId: false,
    firstName: false,
    middleName: false,
    lastName: false,
    email: false,
    remarks: false,
  })

  const errors = Object.fromEntries(
    (Object.keys(FIELDS) as FormField[]).map((field) => [
      field,
      validateField(FIELDS[field], form[field]),
    ]),
  ) as Record<FormField, string | null>

  const isValid = Object.values(errors).every((error) => error === null)

  function update(field: FormField) {
    return (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  function markTouched(field: FormField) {
    return () => setTouched((prev) => ({ ...prev, [field]: true }))
  }

  function resetState() {
    setForm(EMPTY_FORM)
    setTouched({
      netId: false,
      firstName: false,
      middleName: false,
      lastName: false,
      email: false,
      remarks: false,
    })
  }

  function handleProceed(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValid) return
    const record = addTest({
      netId: form.netId.trim(),
      firstName: form.firstName.trim(),
      middleName: form.middleName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      remarks: form.remarks.trim(),
    })
    setOpen(false)
    resetState()
    // Head to the data-acquisition / monitoring view for the new test.
    router.push(`/dashboard/tests/${record.testId}`)
  }

  function fieldError(field: FormField) {
    return touched[field] ? errors[field] : null
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) resetState()
      }}
    >
      <DialogTrigger asChild>
        <SidebarMenuButton className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground">
          <IconCirclePlusFilled />
          <span>Start New Test</span>
        </SidebarMenuButton>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleProceed} noValidate>
          <DialogHeader>
            <DialogTitle>Start new test</DialogTitle>
            <DialogDescription>
              A unique Test ID and timestamp are generated automatically. All
              fields below are required. Proceed to begin data acquisition.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="net-id">Net ID</Label>
              <Input
                id="net-id"
                value={form.netId}
                onChange={update("netId")}
                onBlur={markTouched("netId")}
                placeholder="e.g. jd1234"
                aria-invalid={!!fieldError("netId")}
                autoFocus
              />
              {fieldError("netId") ? (
                <p className="text-xs text-destructive">{fieldError("netId")}</p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="first-name">First name</Label>
                <Input
                  id="first-name"
                  value={form.firstName}
                  onChange={update("firstName")}
                  onBlur={markTouched("firstName")}
                  aria-invalid={!!fieldError("firstName")}
                />
                {fieldError("firstName") ? (
                  <p className="text-xs text-destructive">
                    {fieldError("firstName")}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="middle-name">Middle name</Label>
                <Input
                  id="middle-name"
                  value={form.middleName}
                  onChange={update("middleName")}
                  onBlur={markTouched("middleName")}
                  aria-invalid={!!fieldError("middleName")}
                />
                {fieldError("middleName") ? (
                  <p className="text-xs text-destructive">
                    {fieldError("middleName")}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="last-name">Last name</Label>
                <Input
                  id="last-name"
                  value={form.lastName}
                  onChange={update("lastName")}
                  onBlur={markTouched("lastName")}
                  aria-invalid={!!fieldError("lastName")}
                />
                {fieldError("lastName") ? (
                  <p className="text-xs text-destructive">
                    {fieldError("lastName")}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={update("email")}
                onBlur={markTouched("email")}
                placeholder="name@nyu.edu"
                aria-invalid={!!fieldError("email")}
              />
              {fieldError("email") ? (
                <p className="text-xs text-destructive">{fieldError("email")}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea
                id="remarks"
                value={form.remarks}
                onChange={update("remarks")}
                onBlur={markTouched("remarks")}
                placeholder="Notes about this test run"
                rows={3}
                aria-invalid={!!fieldError("remarks")}
              />
              {fieldError("remarks") ? (
                <p className="text-xs text-destructive">
                  {fieldError("remarks")}
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!isValid}>
              Proceed
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
