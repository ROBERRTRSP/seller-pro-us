import type { Metadata } from "next";
import "./globals.css";
import { getSiteSettingsPublic } from "@/lib/site-settings";
import { DEFAULT_SITE_SETTINGS } from "@/lib/site-settings-defaults";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const s = await getSiteSettingsPublic();
    return {
      title: s.siteTitle,
      description: s.siteDescription,
      icons: {
        icon: [{ url: "/brand/seller-pro-us.svg", type: "image/svg+xml" }],
        apple: [{ url: "/brand/seller-pro-us.svg" }],
      },
    };
  } catch (e) {
    console.error("[layout] generateMetadata", e);
    return {
      title: DEFAULT_SITE_SETTINGS.siteTitle,
      description: DEFAULT_SITE_SETTINGS.siteDescription,
      icons: {
        icon: [{ url: "/brand/seller-pro-us.svg", type: "image/svg+xml" }],
        apple: [{ url: "/brand/seller-pro-us.svg" }],
      },
    };
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
