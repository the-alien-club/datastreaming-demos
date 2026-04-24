import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh gap-4">
      <h2 className="text-xl font-semibold">Page not found</h2>
      <Button asChild>
        <Link href="/agents">Go to Agents</Link>
      </Button>
    </div>
  )
}
