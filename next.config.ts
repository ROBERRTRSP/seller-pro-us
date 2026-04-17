import path from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

/** Carpeta real del proyecto (evita que Turbopack use otro lockfile fuera del repo). */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const isProd = process.env.NODE_ENV === "production";

function buildSecurityHeaders(): { key: string; value: string }[] {
  const headers: { key: string; value: string }[] = [
    { key: "X-DNS-Prefetch-Control", value: "on" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(), geolocation=(), payment=()",
    },
  ];

  if (isProd) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }

  // Next.js needs inline scripts for hydration; tighten img/connect for this app.
  const scriptSrc = isProd
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  if (isProd) csp.push("upgrade-insecure-requests");
  headers.push({ key: "Content-Security-Policy", value: csp.join("; ") });

  return headers;
}

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
  webpack: (config, { dev }) => {
    // `npm run dev` usa Turbopack por defecto (sin este problema). Si usas `npm run dev:webpack`:
    if (dev) {
      config.cache = false;
    }
    return config;
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
