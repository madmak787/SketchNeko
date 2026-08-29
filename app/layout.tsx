import type React from "react"
import type { Metadata } from "next"
import { Fredoka } from "next/font/google"
import "./globals.css"

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-fredoka",
})

export const metadata: Metadata = {
  title: "SketchNeko 🐱 - Anime Drawing Board",
  description: "A playful anime-styled whiteboard for creative minds. Draw, sketch, and create with style!",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${fredoka.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
