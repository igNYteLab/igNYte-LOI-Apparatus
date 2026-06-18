// Centralized regex validation for every user-entered field in the app.

export type FieldKind = "netId" | "name" | "email" | "remarks" | "password"

export const FIELD_PATTERNS: Record<FieldKind, RegExp> = {
  // NYU Net ID: initials (2-4 letters) followed by digits, e.g. "jd1234".
  netId: /^[A-Za-z]{2,4}\d{1,6}$/,
  // A name part: starts with a letter; letters plus ' . - allowed.
  name: /^[A-Za-z][A-Za-z'.-]*$/,
  // Pragmatic email check.
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  // Free text, required, capped length (newlines allowed).
  remarks: /^[\s\S]{1,500}$/,
  // At least 6 characters (matches Firebase's minimum).
  password: /^.{6,}$/,
}

export const FIELD_MESSAGES: Record<FieldKind, string> = {
  netId: "Net ID must be initials followed by numbers (e.g. jd1234).",
  name: "Use letters only — apostrophes, periods, and hyphens allowed.",
  email: "Enter a valid email address.",
  remarks: "Remarks are required (up to 500 characters).",
  password: "Password must be at least 6 characters.",
}

/**
 * Validate a single field value against its regex.
 * Returns an error message, or null when valid.
 */
export function validateField(kind: FieldKind, value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return "This field is required."
  if (!FIELD_PATTERNS[kind].test(trimmed)) return FIELD_MESSAGES[kind]
  return null
}
