import { APP_LOCALE } from "@/lib/us-locale";

/** Formats integer cents as US dollars (e.g. $12.34). */
export function formatCents(cents: number) {
  return new Intl.NumberFormat(APP_LOCALE, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
