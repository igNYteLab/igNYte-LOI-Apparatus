"use client"

import { useTheme } from "next-themes"
import { IconMoon, IconSun } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* Both icons render identically on server and client; the `.dark` class
          that next-themes sets on <html> before hydration toggles which one is
          visible — so there is no theme-dependent hydration mismatch. */}
      <IconSun className="hidden dark:block" />
      <IconMoon className="block dark:hidden" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
