"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { FirebaseError } from "firebase/app"

import { useAuth } from "@/components/auth-provider"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { validateField } from "@/lib/validation"

function getAuthErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Incorrect email or password."
      case "auth/email-already-in-use":
        return "An account with this email already exists."
      case "auth/weak-password":
        return "Password should be at least 6 characters."
      case "auth/popup-closed-by-user":
        return "Sign-in was cancelled."
      default:
        return "Something went wrong. Please try again."
    }
  }
  return "Something went wrong. Please try again."
}

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const { user, loading: authLoading, signInWithEmail } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [touched, setTouched] = useState({ email: false, password: false })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const emailError = validateField("email", email)
  const passwordError = validateField("password", password)
  const isValid = !emailError && !passwordError

  // Already signed in? Don't show the login form — go straight to the app.
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard")
    }
  }, [authLoading, user, router])

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setTouched({ email: true, password: true })
    if (!isValid) return
    setError(null)
    setLoading(true)
    try {
      await signInWithEmail(email, password)
      router.push("/dashboard")
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleEmailSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <a
              href="#"
              className="flex flex-col items-center gap-2 font-medium"
            >
              <Image
                src="/logo.png"
                alt="New York University"
                width={233}
                height={40}
                priority
                className="h-9 w-auto object-contain dark:hidden"
              />
              <Image
                src="/logo-dark.png"
                alt="New York University"
                width={233}
                height={40}
                priority
                className="hidden h-9 w-auto object-contain dark:block"
              />
            </a>
            <h1 className="text-xl font-bold">Ignyte Test Bench Monitor</h1>
            
          </div>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="m@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
              aria-invalid={touched.email && !!emailError}
            />
            {touched.email && emailError ? (
              <FieldDescription className="text-destructive">
                {emailError}
              </FieldDescription>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
              aria-invalid={touched.password && !!passwordError}
            />
            {touched.password && passwordError ? (
              <FieldDescription className="text-destructive">
                {passwordError}
              </FieldDescription>
            ) : null}
          </Field>
          {error ? (
            <FieldDescription className="text-center text-destructive">
              {error}
            </FieldDescription>
          ) : null}
          <Field>
            <Button type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Login"}
            </Button>
          </Field>
          
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
        and <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  )
}
