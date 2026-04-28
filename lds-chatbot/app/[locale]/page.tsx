import { redirect } from "next/navigation"

// Redirect the basePath root to the agents list.
// next/navigation redirect prepends basePath, so "/agents" → external /agents/agents.
export default function Home() {
  redirect("/agents")
}
