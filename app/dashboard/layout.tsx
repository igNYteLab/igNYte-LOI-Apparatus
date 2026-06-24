"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { useAuth } from "@/components/auth-provider"
import { DeviceProvider } from "@/components/device-provider"
import { DashboardShellSkeleton } from "@/components/skeletons"
import { SiteHeader } from "@/components/site-header"
import { TestsProvider } from "@/components/tests-provider"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { user, loading, profile, profileLoading, signOut } = useAuth()

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login")
    }
  }, [loading, user, router])

  // Soft-disable: an admin can mark a user "disabled" in the directory, which
  // signs them out on their next navigation. (A hard Firebase Auth disable
  // needs the Admin SDK; this is the client-side equivalent.)
  useEffect(() => {
    if (!profileLoading && profile?.status === "disabled") {
      void signOut()
    }
  }, [profileLoading, profile, signOut])

  if (loading || !user) {
    return <DashboardShellSkeleton />
  }

  return (
    <DeviceProvider>
      <TestsProvider>
        <SidebarProvider
          style={
            {
              "--sidebar-width": "calc(var(--spacing) * 72)",
              "--header-height": "calc(var(--spacing) * 12)",
            } as React.CSSProperties
          }
        >
          <AppSidebar variant="inset" />
          <SidebarInset>
            <SiteHeader />
            {children}
          </SidebarInset>
        </SidebarProvider>
      </TestsProvider>
    </DeviceProvider>
  )
}
