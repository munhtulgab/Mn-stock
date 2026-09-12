/**
 * The top of an admin page: what it is on the left, what acts on the whole of
 * it on the right.
 *
 * Its own component because the three pages were each spelling out the same
 * heading block with slightly different type sizes, which is how a section
 * ends up looking like three sections. The title is set large and tight —
 * this is the one line on the page that says where you are, and the bar above
 * it is deliberately quiet so that it can.
 */
export default function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  /** Controls for the page as a whole; they sit right on a wide screen. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 pb-1">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.025em] text-app-text">
          {title}
        </h1>
        {sub && <p className="mt-1 text-sm text-app-muted">{sub}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
