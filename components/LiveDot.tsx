/**
 * The pulsing green dot that says a figure is moving right now.
 *
 * Shown only while the exchange says it is in session — the index tiles
 * learned that the hard way, pulsing all weekend over a level that had not
 * changed since Friday — so every caller decides that, not this.
 *
 * 8px rather than 4: at four it was a speck beside a label half its own
 * weight, which is not enough to read as the one thing on a card moving.
 */
export default function LiveDot({ label = "Арилжаа явагдаж байна" }: { label?: string }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0" role="img" aria-label={label}>
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-app-positive opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-app-positive" />
    </span>
  );
}
