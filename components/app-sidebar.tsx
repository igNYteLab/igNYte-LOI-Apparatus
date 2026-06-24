"use client"

import * as React from "react"
import Image from "next/image"

import { useAuth } from "@/components/auth-provider"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { IconCpu, IconDashboard, IconUsers } from "@tabler/icons-react"

const sidebarUser = {
  name: "User",
  email: "",
  avatar: "",
}

const BASE_NAV = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: <IconDashboard />,
  },
  {
    title: "Device Board",
    url: "/dashboard/device",
    icon: <IconCpu />,
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isAdmin } = useAuth()
  // The User Management entry is only shown to admins (and the route itself
  // re-checks). Firestore rules are the real enforcement.
  const navMain = isAdmin
    ? [
        ...BASE_NAV,
        {
          title: "User Management",
          url: "/dashboard/users",
          icon: <IconUsers />,
        },
      ]
    : BASE_NAV
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="h-auto data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <a href="#">
                <Image
                  src="/logo.png"
                  alt="New York University"
                  width={163}
                  height={28}
                  priority
                  className="h-7 w-auto object-contain dark:hidden"
                />
                <Image
                  src="/logo-dark.png"
                  alt="New York University"
                  width={163}
                  height={28}
                  priority
                  className="hidden h-7 w-auto object-contain dark:block"
                />
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={sidebarUser} />
      </SidebarFooter>
    </Sidebar>
  )
}
