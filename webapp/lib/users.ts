// =============================================================================
// User management — Firebase Auth accounts + a Firestore "users" directory.
// =============================================================================
// New accounts are created as real Firebase Authentication users. To avoid
// signing the admin out (the client SDK signs you in as whoever you just
// created), creation happens on a short-lived *secondary* Firebase app. The
// new user gets a random throwaway password and a password-reset email, so
// they set their own password and sign in normally.
//
// Alongside each Auth account we keep a profile document in the Firestore
// `users` collection so the app can list/manage users and store roles. All
// privileged operations are additionally guarded by Firestore Security Rules
// (see firestore.rules) — the UI gating here is convenience, the rules are the
// real boundary.
// =============================================================================

import { deleteApp, initializeApp } from "firebase/app"
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth"
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
} from "firebase/firestore"

import { auth, db, firebaseConfig } from "@/lib/firebase"

export type UserRole = "admin" | "member"
export type UserStatus = "invited" | "active" | "disabled"

export const USER_ROLES: UserRole[] = ["admin", "member"]
export const USERS_COLLECTION = "users"

/** A profile document from the `users` collection, normalized for the UI. */
export type ManagedUser = {
  uid: string
  email: string
  displayName: string
  role: UserRole
  status: UserStatus
  createdAt: string | null // ISO-8601
  createdBy: string | null
  lastLoginAt: string | null // ISO-8601
}

export type NewUserInput = {
  email: string
  displayName: string
  role: UserRole
}

// ---- Normalization ----------------------------------------------------------

function tsToIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null
}

function toManagedUser(uid: string, data: DocumentData): ManagedUser {
  const status = data.status
  return {
    uid,
    email: typeof data.email === "string" ? data.email : "",
    displayName: typeof data.displayName === "string" ? data.displayName : "",
    role: data.role === "admin" ? "admin" : "member",
    status:
      status === "active" || status === "disabled" || status === "invited"
        ? status
        : "invited",
    createdAt: tsToIso(data.createdAt),
    createdBy: typeof data.createdBy === "string" ? data.createdBy : null,
    lastLoginAt: tsToIso(data.lastLoginAt),
  }
}

/** A strong, single-use password the new user never sees — they reset it. */
function generateTempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(4))
  const random = Array.from(bytes, (n) => n.toString(36)).join("")
  // Guarantees length >= 6 with upper/lower/digit/symbol for any password policy.
  return `Aa1!${random}`
}

// ---- Account creation -------------------------------------------------------

/**
 * Create a Firebase Auth account on a secondary app (so the current admin stays
 * signed in), write the directory profile, and email a password-reset link.
 *
 * @param input        Email, display name, and role for the new user.
 * @param createdByUid  UID of the admin performing the action.
 */
export async function createUserAccount(
  input: NewUserInput,
  createdByUid: string,
): Promise<ManagedUser> {
  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName.trim()
  const role: UserRole = input.role === "admin" ? "admin" : "member"

  // A uniquely-named, disposable app instance keeps this auth flow isolated
  // from the primary (admin) session.
  const secondaryApp = initializeApp(
    firebaseConfig,
    `user-admin-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  try {
    const secondaryAuth = getAuth(secondaryApp)
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      generateTempPassword(),
    )
    const uid = credential.user.uid
    // Don't keep the freshly-created user signed in on the secondary app.
    await signOut(secondaryAuth)

    // Write the directory profile as the admin (primary db session).
    await setDoc(doc(db, USERS_COLLECTION, uid), {
      email,
      displayName,
      role,
      status: "invited",
      createdAt: serverTimestamp(),
      createdBy: createdByUid,
      lastLoginAt: null,
    })

    // Email the reset link so the user sets their own password and can log in.
    await sendPasswordResetEmail(auth, email)

    return {
      uid,
      email,
      displayName,
      role,
      status: "invited",
      createdAt: null,
      createdBy: createdByUid,
      lastLoginAt: null,
    }
  } finally {
    // Always tear down the secondary app, even on failure.
    await deleteApp(secondaryApp).catch(() => {})
  }
}

// ---- Directory reads --------------------------------------------------------

/** Live subscription to the whole user directory, newest first. */
export function subscribeToUsers(
  onChange: (users: ManagedUser[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const q = query(
    collection(db, USERS_COLLECTION),
    orderBy("createdAt", "desc"),
  )
  return onSnapshot(
    q,
    (snapshot) => {
      onChange(snapshot.docs.map((d) => toManagedUser(d.id, d.data())))
    },
    onError,
  )
}

/** Live subscription to a single user's profile (used for the current user). */
export function subscribeToUserProfile(
  uid: string,
  onChange: (user: ManagedUser | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, USERS_COLLECTION, uid),
    (snapshot) => {
      onChange(snapshot.exists() ? toManagedUser(snapshot.id, snapshot.data()) : null)
    },
    onError,
  )
}

export async function getUserProfile(uid: string): Promise<ManagedUser | null> {
  const snapshot = await getDoc(doc(db, USERS_COLLECTION, uid))
  return snapshot.exists() ? toManagedUser(snapshot.id, snapshot.data()) : null
}

// ---- Directory writes -------------------------------------------------------

/** Re-send the password-reset link for an existing account. */
export async function resendResetLink(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase())
}

export async function setUserRole(uid: string, role: UserRole): Promise<void> {
  await updateDoc(doc(db, USERS_COLLECTION, uid), { role })
}

export async function setUserStatus(
  uid: string,
  status: UserStatus,
): Promise<void> {
  await updateDoc(doc(db, USERS_COLLECTION, uid), { status })
}

/**
 * Record a sign-in on the user's own profile: stamp lastLoginAt and promote an
 * "invited" user to "active". Never touches a "disabled" account. No-ops when
 * the user has no directory document. Best-effort — failures are swallowed.
 */
export async function markSignedIn(uid: string): Promise<void> {
  try {
    const ref = doc(db, USERS_COLLECTION, uid)
    const snapshot = await getDoc(ref)
    if (!snapshot.exists()) return
    const current = snapshot.data()
    if (current.status === "disabled") return
    const patch: Record<string, unknown> = { lastLoginAt: serverTimestamp() }
    if (current.status === "invited") patch.status = "active"
    await updateDoc(ref, patch)
  } catch {
    // Non-fatal: sign-in must succeed even if the profile write doesn't.
  }
}
