import { redirect } from "next/navigation"

export default function Page() {
  // The app entry point is the login screen (which itself forwards already
  // authenticated users on to the dashboard).
  redirect("/login")
}
