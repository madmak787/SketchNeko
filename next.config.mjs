// Same convention as the other tools on tool.khanamir.me: the base path comes from
// NEXT_PUBLIC_BASE_PATH, or from the path of NEXT_PUBLIC_APP_URL (set by CI to
// https://tool.khanamir.me/sketch). Locally neither is set, so the app runs at "/".
function resolveBasePath() {
  if (process.env.NEXT_PUBLIC_BASE_PATH) {
    return process.env.NEXT_PUBLIC_BASE_PATH.replace(/\/$/, "")
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) return ""

  try {
    const { pathname } = new URL(appUrl)
    if (!pathname || pathname === "/") return ""
    return pathname.replace(/\/$/, "")
  } catch {
    return ""
  }
}

export const basePath = resolveBasePath()

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  ...(basePath ? { basePath } : {}),
  // Emit folder/index.html files so URLs work on any static host (e.g. Hostinger)
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  // The dev-mode indicator sits on top of the zoom controls
  devIndicators: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
