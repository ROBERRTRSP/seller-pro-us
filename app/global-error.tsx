"use client";

import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
          <h1 className="text-xl font-semibold">Application error</h1>
          <p className="max-w-md text-center text-sm text-[var(--muted)]">
            {error.message || "Could not load the page."}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
