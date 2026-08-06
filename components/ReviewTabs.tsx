"use client";

import { useState } from "react";

export interface ReviewTab {
  /** Short enough for a chip on a phone: "Өчигдөр", "7 хоног". */
  label: string;
  content: React.ReactNode;
}

/**
 * The day, the week and the month as one panel with a chip to switch.
 *
 * Stacked, the three reviews were most of a screen each and the headlines
 * they introduce were three scrolls down. Only one period is being read at a
 * time, so only one is on the page at a time — and it opens on the last
 * session, which is the one that has just changed.
 *
 * The panels are rendered on the server and handed here as children, so
 * switching costs nothing: the figures are already on the page.
 */
export default function ReviewTabs({ tabs }: { tabs: ReviewTab[] }) {
  const [active, setActive] = useState(0);
  if (tabs.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              i === active
                ? "bg-brand text-black"
                : "bg-app-card text-app-muted border border-app-border active:opacity-70"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Every panel stays mounted and all but one is hidden: switching back
          to a tab should not rebuild a table of two hundred cells. */}
      {tabs.map((tab, i) => (
        <div key={tab.label} hidden={i !== active}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
