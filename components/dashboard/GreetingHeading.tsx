"use client";

/**
 * GreetingHeading — shows "Good [period], [name] 👋" using the user's
 * LOCAL BROWSER TIME, never the server/UTC clock.
 *
 * Why useState(null) + useEffect instead of suppressHydrationWarning?
 * ───────────────────────────────────────────────────────────────────
 * suppressHydrationWarning does NOT update the DOM to the client value.
 * React docs: "The DOM node is left as-is." — meaning React keeps the
 * server-rendered HTML and skips reconciliation for that node. Since the
 * component has no state to trigger a re-render, the wrong server-side
 * greeting (UTC clock) would be frozen in the DOM forever.
 *
 * The correct pattern:
 *   1. useState(null) → both server and client render null initially.
 *      The server-rendered HTML and the first client render MATCH exactly,
 *      so React hydrates without a mismatch warning.
 *   2. useEffect fires after mount (client only) → sets the real local-time
 *      greeting. React re-renders with the correct value.
 *
 * The result: the greeting word is absent for one frame (virtually
 * imperceptible), then immediately shows the correct local-time period.
 * The name + 👋 are visible the whole time, so there is no layout shift.
 *
 * Time bands (local hour — new Date().getHours()):
 *   5  – 11  → Good morning
 *   12 – 16  → Good afternoon
 *   17 – 23  → Good evening
 *   0  – 4   → Welcome back
 */

import { useEffect, useState } from "react";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "Good morning";   //  5:00 – 11:59
  if (h >= 12 && h < 17) return "Good afternoon"; // 12:00 – 16:59
  if (h >= 17)            return "Good evening";   // 17:00 – 23:59
  return "Welcome back";                           //  0:00 –  4:59
}

interface GreetingHeadingProps {
  firstName: string;
  className?: string;
}

export function GreetingHeading({ firstName, className }: GreetingHeadingProps) {
  // null = not yet mounted (server + first client render both see null → no mismatch)
  // string = mounted, holds the local-time greeting
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    // Runs only on the client, after hydration. new Date() here uses the
    // browser's local timezone, not the Vercel server's UTC clock.
    setGreeting(getGreeting());
  }, []);

  return (
    <h1 className={className ?? "text-2xl font-bold tracking-tight text-white sm:text-3xl"}>
      {greeting !== null ? `${greeting}, ` : ""}{firstName} 👋
    </h1>
  );
}
