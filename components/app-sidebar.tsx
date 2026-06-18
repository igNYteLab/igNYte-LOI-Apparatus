"use client"

import * as React from "react"
import Image from "next/image"

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
import { IconCpu, IconDashboard } from "@tabler/icons-react"

const data = {
  user: {
    name: "User",
    email: "",
    avatar: "",
  },
  navMain: [
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
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
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
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
