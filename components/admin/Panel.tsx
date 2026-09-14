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
 *
 * `fill` is for a panel sharing a row with something taller: it takes the
 * height of the row and hands the slack to its body, so the pair reads as one
 * band rather than as a card with a step cut out of its right-hand side. Off
 * by default, because a panel in a column of panels should be as tall as what
 * is in it and no taller.
 */
export default function Panel({
  title,
  note,
  flush,
  fill,
  children,
}: {
  title: string;
  /** Right of the title: a pill control, a link, a count. */
  note?: React.ReactNode;
  flush?: boolean;
  /** Take the whole row's height and give the extra to the body. */
  fill?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-app-border bg-app-card ${
        fill ? "flex h-full flex-col" : ""
      }`}
    >
      <div
        className={`flex items-center justify-between gap-3 px-5 pt-5 ${
          flush ? "pb-4" : "pb-0"
        }`}
      >
        <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-app-text">
          {title}
        </h2>
        {note && <span className="shrink-0 text-[13px] text-app-muted">{note}</span>}
      </div>
      <div className={`${flush ? "" : "px-5 pt-4 pb-5"} ${fill ? "flex-1" : ""}`}>
        {children}
      </div>
    </section>
  );
}
