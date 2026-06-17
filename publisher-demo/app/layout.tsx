import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import { Providers } from "@/components/providers"
import "./globals.css"

export const metadata: Metadata = {
  title: "Alien — Live demo",
  description:
    "Your data. Your APIs. Agent-ready. Royalty-bearing. A live demo of the Alien publisher platform.",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  /* When the virtual keyboard opens, resize the layout viewport instead
     of overlaying it. Keeps the composer input above the keyboard on
     Android/iOS browsers that support the spec. */
  interactiveWidget: "resizes-content",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <div id="app-root">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  )
}
