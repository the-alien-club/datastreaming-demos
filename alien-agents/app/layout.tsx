// Root layout: pass-through required by Next.js App Router.
// The actual <html> and <body> are rendered by app/[locale]/layout.tsx
// so the lang attribute is set correctly per locale.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
