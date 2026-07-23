"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth"

import { auth, googleProvider } from "@/lib/firebase"
import {
  markSignedIn,
  subscribeToUserProfile,
  type ManagedUser,
} from "@/lib/users"

type AuthContextValue = {
  user: User | null
  loading: boolean
  /** The signed-in user's directory profile, or null if they have none. */
  profile: ManagedUser | null
  /** True until the profile lookup for the current user has resolved. */
  profileLoading: boolean
  /** Convenience: the current user's role is "admin". */
  isAdmin: boolean
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  // Profile is tagged with the uid it belongs to so a stale value from a
  // previous user is ignored while the next user's profile loads.
  const [profileState, setProfileState] = useState<{
    uid: string
    profile: ManagedUser | null
  } | null>(null)
  const lastUidRef = useRef<string | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
      // Stamp the sign-in once per login (not on every token refresh).
      if (nextUser) {
        if (nextUser.uid !== lastUidRef.current) {
          lastUidRef.current = nextUser.uid
          void markSignedIn(nextUser.uid)
        }
      } else {
        lastUidRef.current = null
      }
    })
    return unsubscribe
  }, [])

  // Keep the current user's directory profile live (role, status, etc.). State
  // is written only from the subscription callbacks — never synchronously in
  // the effect body.
  useEffect(() => {
    if (!user) return
    const unsubscribe = subscribeToUserProfile(
      user.uid,
      (next) => setProfileState({ uid: user.uid, profile: next }),
      () => setProfileState({ uid: user.uid, profile: null }),
    )
    return unsubscribe
  }, [user])

  const profileResolved = !!user && profileState?.uid === user.uid
  const profile = profileResolved && profileState ? profileState.profile : null
  const profileLoading = !!user && !profileResolved

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      profile,
      profileLoading,
      isAdmin: profile?.role === "admin",
      signInWithEmail: async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password)
      },
      signUpWithEmail: async (email, password) => {
        await createUserWithEmailAndPassword(auth, email, password)
      },
      signInWithGoogle: async () => {
        await signInWithPopup(auth, googleProvider)
      },
      signOut: async () => {
        await firebaseSignOut(auth)
      },
      sendPasswordReset: async (email) => {
        await sendPasswordResetEmail(auth, email.trim().toLowerCase())
      },
    }),
    [user, loading, profile, profileLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an <AuthProvider>")
  }
  return context
}
