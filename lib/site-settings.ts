import { prisma } from "@/lib/db";
import { mergeSiteSettingsRow, type SiteSettingsPublic } from "@/lib/site-settings-defaults";

const SETTINGS_ID = "default";

export async function getSiteSettingsPublic(): Promise<SiteSettingsPublic> {
  try {
    const row = await prisma.siteSettings.findUnique({ where: { id: SETTINGS_ID } });
    return mergeSiteSettingsRow(row);
  } catch (e) {
    console.error("[getSiteSettingsPublic] DB unavailable, using defaults:", e);
    return mergeSiteSettingsRow(null);
  }
}
