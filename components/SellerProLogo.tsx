/**
 * Seller Pro US — brand mark (rounded tile + SP + US colors) + wordmark.
 */
export function SellerProLogo({
  brandName = "Seller Pro US",
  size = "md",
  className = "",
}: {
  brandName?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const iconPx = size === "sm" ? 32 : size === "lg" ? 44 : 38;
  const textMain =
    size === "sm" ? "text-base" : size === "lg" ? "text-xl sm:text-2xl" : "text-lg sm:text-xl";

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <SellerProMark size={iconPx} className="shrink-0 drop-shadow-sm" />
      <span className={`flex min-w-0 flex-col leading-tight ${textMain}`}>
        <span className="truncate font-black tracking-tight text-[#0071dc]">{brandName}</span>
        <span className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500 sm:block">
          Pro storefront · US
        </span>
      </span>
    </span>
  );
}

/** Square mark: SP monogram + subtle US stripe accent. */
export function SellerProMark({ className = "", size = 40 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className}
      role="img"
      aria-label="Seller Pro US"
    >
      <title>Seller Pro US</title>
      <rect x="1" y="1" width="38" height="38" rx="10" fill="#0071dc" />
      <rect x="1" y="1" width="38" height="38" rx="10" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <text
        x="50%"
        y="54%"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="white"
        fontSize="14"
        fontWeight="900"
        fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
        letterSpacing="-0.04em"
      >
        SP
      </text>
      <rect x="28" y="6" width="6" height="3.5" rx="0.5" fill="#b31942" />
      <rect x="28" y="10" width="6" height="2.5" rx="0.5" fill="white" />
      <rect x="28" y="13.5" width="6" height="3.5" rx="0.5" fill="#1a3a6e" />
    </svg>
  );
}
