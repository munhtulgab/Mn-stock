/**
 * A card with a heading: what nearly everything in this area sits inside.
 *
 * The heading is the panel's name on the left and, where there is one, a
 * control on the right — a period, a link, a count. That pairing is what
 * lets a page of panels be scanned by their titles alone, and it is why the
 * title is a plain 17px rather than a shouted uppercase label.
 *
 * `flush` is for a panel whose content is a table or a list of rows that must
 * reach the card's own edges; the heading keeps its padding either way.
 */
export default function Panel({
  title,
  note,
  flush,
  watermark,
  children,
}: {
  title: string;
  /** Right of the title: a pill control, a link, a count. */
  note?: React.ReactNode;
  flush?: boolean;
  /**
   * A decorative layer behind the header and content — a tint, a large
   * faint glyph, or both. Painted first and left un-positioned in the
   * stacking order, so it stays behind so long as the header/content wrapper
   * below keeps its own `relative` (any positioned sibling that follows in
   * the DOM paints on top of an earlier one with the same auto z-index).
   */
  watermark?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-app-border bg-app-card">
      {watermark}
      <div
        className={`relative flex items-center justify-between gap-3 px-5 pt-5 ${
          flush ? "pb-4" : "pb-0"
        }`}
      >
        <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-app-text">
          {title}
        </h2>
        {note && <span className="shrink-0 text-[13px] text-app-muted">{note}</span>}
      </div>
      <div className={`relative ${flush ? "" : "px-5 pt-4 pb-5"}`}>{children}</div>
    </section>
  );
}
