"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"

import type { TestRecord } from "@/components/data-table"

const STORAGE_KEY = "ignyte.tests"

type NewTestInput = {
  psetId: string
  netId: string
  firstName: string
  middleName: string
  lastName: string
  email: string
  remarks: string
}

type TestsContextValue = {
  tests: TestRecord[]
  hydrated: boolean
  addTest: (input: NewTestInput) => TestRecord
  getTest: (psetId: string) => TestRecord | undefined
}

const TestsContext = createContext<TestsContextValue | null>(null)

export function TestsProvider({ children }: { children: React.ReactNode }) {
  const [tests, setTests] = useState<TestRecord[]>([])
  const [hydrated, setHydrated] = useState(false)
  // Load persisted tests once on mount (client only). Deferred to a macrotask
  // so we don't call setState synchronously inside the effect body.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw) {
          setTests(JSON.parse(raw) as TestRecord[])
        }
      } catch {
        // Ignore malformed/unavailable storage.
      }
      setHydrated(true)
    }, 0)
    return () => window.clearTimeout(handle)
  }, [])

  // Persist on change — but only once hydration has loaded any existing data.
  // This prevents the initial empty state (and React StrictMode's double-invoked
  // effects in dev) from overwriting saved tests with an empty array on reload.
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tests))
    } catch {
      // Ignore quota/serialization errors.
    }
  }, [tests, hydrated])

  const addTest = useCallback((input: NewTestInput) => {
    const record: TestRecord = {
      psetId: input.psetId,
      performedAt: new Date().toISOString(),
      netId: input.netId,
      firstName: input.firstName,
      middleName: input.middleName,
      lastName: input.lastName,
      email: input.email,
      remarks: input.remarks,
    }
    setTests((prev) => [
      record,
      ...prev.filter((test) => test.psetId !== record.psetId),
    ])
    return record
  }, [])

  const getTest = useCallback(
    (psetId: string) => tests.find((test) => test.psetId === psetId),
    [tests]
  )

  return (
    <TestsContext.Provider value={{ tests, hydrated, addTest, getTest }}>
      {children}
    </TestsContext.Provider>
  )
}

export function useTests() {
  const context = useContext(TestsContext)
  if (!context) {
    throw new Error("useTests must be used within a <TestsProvider>")
  }
  return context
}
