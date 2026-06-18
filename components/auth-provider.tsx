"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth"

import { auth, googleProvider } from "@/lib/firebase"

type AuthContextValue = {
  user: User | null
  loading: boolean
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
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
    }),
    [user, loading],
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
