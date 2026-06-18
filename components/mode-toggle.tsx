"use client"

import { useTheme } from "next-themes"
import { IconMoon, IconSun } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark"

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Switch to ${nextTheme} theme`}
      onClick={() => setTheme(nextTheme)}
    >
      {resolvedTheme === "dark" ? <IconSun /> : <IconMoon />}
    </Button>
  )
}
