import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Derive a display username from an email address (the local part before "@"). */
export function usernameFromEmail(email: string | null | undefined): string {
  if (!email) return ""
  const at = email.indexOf("@")
  return at > 0 ? email.slice(0, at) : email
}
