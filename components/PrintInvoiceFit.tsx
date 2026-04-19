"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";

function browserZoomWorks(): boolean {
  if (typeof document === "undefined") return false;
  const div = document.createElement("div");
  div.style.zoom = "2";
  return div.style.zoom === "2";
}

/**
 * Antes de imprimir, escala la factura si no cabe en una A4 vertical (~márgenes 5 mm).
 */
export function PrintInvoiceFit({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  const applyFit = useCallback(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;

    el.style.removeProperty("zoom");
    el.style.removeProperty("transform");
    el.style.removeProperty("transform-origin");
    el.style.removeProperty("width");

    requestAnimationFrame(() => {
      const mmToPx = 96 / 25.4;
      const pageMm = 297 - 10;
      const maxContentPx = Math.floor(pageMm * mmToPx);
      const slack = 32;
      const available = maxContentPx - slack;

      const h = el.scrollHeight;
      if (h <= available || h < 1) return;

      const scale = Math.max(0.38, Math.min(1, available / h));

      if (browserZoomWorks()) {
        (el.style as CSSStyleDeclaration & { zoom: string }).zoom = String(scale);
        return;
      }

      el.style.transformOrigin = "top left";
      el.style.transform = `scale(${scale})`;
      el.style.width = `${(100 / scale).toFixed(4)}%`;
    });
  }, []);

  const resetFit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.removeProperty("zoom");
    el.style.removeProperty("transform");
    el.style.removeProperty("transform-origin");
    el.style.removeProperty("width");
  }, []);

  useEffect(() => {
    window.addEventListener("beforeprint", applyFit);
    window.addEventListener("afterprint", resetFit);
    return () => {
      window.removeEventListener("beforeprint", applyFit);
      window.removeEventListener("afterprint", resetFit);
    };
  }, [applyFit, resetFit]);

  return (
    <div ref={ref} className="print-invoice-fit-root mx-auto w-full max-w-2xl print:max-w-none">
      {children}
    </div>
  );
}
