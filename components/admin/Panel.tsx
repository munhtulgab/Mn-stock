/**
 * A card with a heading: what nearly everything in this area sits inside.
 *
 * The heading is an eyebrow plus a title rather than one line of bold text.
 * The eyebrow says what kind of thing this is — Идэвх, Байдал, Түүх — and the
 * title says which one, so a page of five cards reads as a page rather than
 * as five unrelated boxes, and the titles stay short enough to scan.
 *
 * `flush` is for a panel whose content is a table or a list of rows that must
 * reach the card's own edges; the heading keeps its padding either way.
 */
export default function Panel({
  eyebrow,
  title,
  note,
  flush,
  children,
}: {
  eyebrow?: string;
  title: string;
  /** Small, right-aligned: a count, a link, a timestamp. */
  note?: React.ReactNode;
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="lift overflow-hidden rounded-2xl border border-app-border bg-app-card">
      <div className={`flex items-baseline gap-2.5 px-4 pt-4 ${flush ? "pb-3" : "pb-0"}`}>
        {eyebrow && (
          <span className="text-[10px] font-semibold tracking-[0.11em] text-app-muted uppercase">
            {eyebrow}
          </span>
        )}
        <h2 className="text-[15px] font-semibold text-app-text">{title}</h2>
        {note && <span className="ml-auto text-xs text-app-muted">{note}</span>}
      </div>
      <div className={flush ? "" : "px-4 pt-3 pb-4"}>{children}</div>
    </section>
  );
}
