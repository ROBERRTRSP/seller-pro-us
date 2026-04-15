/**
 * Default catalog section names and seed order (sortOrder index when seeding categories).
 * Admins can add more categories in Admin → Categories.
 */
export const CATALOG_SECTION_ORDER: string[] = [
  "Mother's Day gifts",
  "Beauty & fragrances",
  "Fashion & accessories",
  "Spruce up your space",
  "Popular home picks",
  "Tech & gadgets",
  "Must-have gift sets",
  "Jewelry & watches",
  "$15 & under",
  "100+ gifts for Mom",
];

/**
 * Sort storefront section titles: lower sortOrder first, then alphabetically.
 * `sortOrderHint` maps section label → minimum sortOrder among products in that section.
 */
export function sortCategorySectionKeys(keys: string[], sortOrderHint: Map<string, number>): string[] {
  return [...keys].sort((a, b) => {
    const ia = sortOrderHint.get(a) ?? 999999;
    const ib = sortOrderHint.get(b) ?? 999999;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
}
