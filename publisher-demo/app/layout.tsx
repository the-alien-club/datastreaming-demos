import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Providers } from "@/components/providers"
import "./globals.css"

export const metadata: Metadata = {
  title: "Alien — Live demo",
  description:
    "Your data. Your APIs. Agent-ready. Royalty-bearing. A live demo of the Alien publisher platform.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <div id="app-root" style={{ height: "100vh" }}>
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  )
}
