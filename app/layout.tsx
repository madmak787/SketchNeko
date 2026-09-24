import type React from "react"
import type { Metadata, Viewport } from "next"
import { Caveat, Fredoka, Inter } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { asset } from "@/lib/utils"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fredoka",
})

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-caveat",
})

export const metadata: Metadata = {
  title: {
    default: "SketchNeko — A hand-drawn whiteboard",
    template: "%s · SketchNeko",
  },
  description:
    "A fast, private, hand-drawn style whiteboard. Sketch diagrams, wireframes and ideas right in your browser — no account needed.",
  icons: { icon: asset("/favicon.jpg") },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The canvas implements its own pinch-zoom; stop the browser from zooming the whole UI
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#18181b" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${fredoka.variable} ${caveat.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="bottom-center" closeButton />
        </ThemeProvider>
      </body>
    </html>
  )
}
