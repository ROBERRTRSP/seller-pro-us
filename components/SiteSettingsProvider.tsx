"use client";

import { createContext, useContext } from "react";
import type { SiteSettingsPublic } from "@/lib/site-settings-defaults";
import { DEFAULT_SITE_SETTINGS } from "@/lib/site-settings-defaults";

const SiteSettingsContext = createContext<SiteSettingsPublic>({ ...DEFAULT_SITE_SETTINGS });

export function SiteSettingsProvider({
  value,
  children,
}: {
  value: SiteSettingsPublic;
  children: React.ReactNode;
}) {
  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings(): SiteSettingsPublic {
  return useContext(SiteSettingsContext);
}
