/**
 * The top of an admin page: what it is, and anything that acts on the whole
 * of it.
 *
 * Its own component because the three pages were each spelling out the same
 * heading block with slightly different type sizes, which is how a section
 * ends up looking like three sections.
 */
export default function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  /** Buttons for the page as a whole; they sit right on a wide screen. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-app-text">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-app-muted">{sub}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
