"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";

// Each subject gets a deterministic color based on a simple hash of its name.
// Same subject → always same color, no configuration needed.

const PALETTES = [
  { bg: "bg-brand-500/10",   text: "text-brand-400",   dot: "bg-brand-400"   },
  { bg: "bg-violet-500/10",  text: "text-violet-400",  dot: "bg-violet-400"  },
  { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  { bg: "bg-orange-500/10",  text: "text-orange-400",  dot: "bg-orange-400"  },
  { bg: "bg-pink-500/10",    text: "text-pink-400",    dot: "bg-pink-400"    },
  { bg: "bg-yellow-500/10",  text: "text-yellow-400",  dot: "bg-yellow-400"  },
  { bg: "bg-teal-500/10",    text: "text-teal-400",    dot: "bg-teal-400"    },
  { bg: "bg-red-500/10",     text: "text-red-400",     dot: "bg-red-400"     },
] as const;

export function subjectPalette(subject: string) {
  let hash = 0;
  for (let i = 0; i < subject.length; i++) {
    hash = (hash * 31 + subject.charCodeAt(i)) % PALETTES.length;
  }
  return PALETTES[Math.abs(hash)];
}

export const SubjectBadge = memo(function SubjectBadge({ subject }: { subject: string }) {
  const p = subjectPalette(subject);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        p.bg,
        p.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />
      {subject}
    </span>
  );
});
